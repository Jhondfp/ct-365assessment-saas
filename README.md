# CT Assessment 365 — SaaS

Versão SaaS do [ct-assessmentspo](https://github.com/Jhondfp/ct-assessmentspo): o mesmo coletor PowerShell de governança de Microsoft 365 (SharePoint, OneDrive, licenças, adoção, Exchange, Intune), agora operado por um portal web. Cada cliente tem um **banco isolado** e as coletas rodam em **workers** no Azure Container Apps, que pegam o trabalho numa fila do portal.

O portal usa o mesmo layout e a mesma autenticação mista do **Target360** (Next.js 15 + Auth.js v5 + Prisma + Azure SQL): login com **Microsoft 365** (Entra ID multi-tenant) e login **local** (e-mail + senha).

```
                 ┌──────────────── Azure Container Apps ────────────────┐
 equipe CT ──►   │  portal (Next.js)            coletor (job da fila)   │
 (M365/senha)    │   ├ clientes, conexões  ◄──  pede a próxima coleta   │──► Microsoft 365 do cliente
                 │   ├ fila e progresso    ◄──  job/ = coletor PS + PnP  │    (Graph + SharePoint/PnP)
                 │   └ dashboard              │                          │
                 └──────┬──────────────┬──────┴───────────┬──────────────┘
                        │              │                  │
                 ctassessment_portal   Key Vault     ctassess_<cliente>  (elastic pool, 1 banco por cliente,
                 (usuários, clientes,  (secret/pfx    schema do ct-assessmentspo + procedures sp_dash_*)
                  execuções)            de cada cliente)
```

## Perfis

| Perfil | O que faz |
|---|---|
| **Administrador** | Tudo: usuários e perfis, clientes, bancos, coletas, auditoria. |
| **Executor** | Cadastra e edita clientes (conexão M365, banco) e executa coletas de qualquer cliente. |
| **Visualizador** | Só vê execuções e dashboards dos **clientes liberados** para ele pelo administrador. |

Nesta fase só a equipe Cloud Target acessa. Quem não foi cadastrado só entra se for de um domínio de `INTERNAL_EMAIL_DOMAINS` (fica aguardando perfil) ou estiver em `ADMIN_EMAILS`.

## Fluxo

1. **Cadastrar o cliente** (Administrador/Executor): dados do cliente, App Registration do cliente (tenant, client id, prefixo do SharePoint e **um** método de autenticação: certificado `.pfx`, que serve para tudo, ou client secret, que só atende o Graph) e o banco:
   - **Criar banco novo** no servidor de clientes da Cloud Target, com o schema padrão do coletor (na hora ou na primeira coleta); ou
   - **Conectar em banco existente** em qualquer SQL Server/Azure SQL (servidor, banco, usuário, senha). A conexão é testada antes de salvar: banco com o schema do coletor (ex.: um assessment antigo do ct-assessmentspo) é aproveitado com o histórico; banco vazio recebe o schema padrão; banco com outras tabelas é recusado.

   Credenciais (M365 e senha do banco existente) vão direto para o Key Vault e nunca são exibidas de volta. O banco pode ser trocado depois na aba *Cadastro e banco*.
2. **Executar uma coleta**: escolher os workloads (sites, arquivos, lixeira, donos ativos, licenciamento, adoção, caixas de e-mail, Intune) e, se quiser, limitar a sites específicos. A coleta entra na fila e o próximo worker livre pega.
3. **Acompanhar**: cada workload com o próprio status (concluído, falhou ou pulado, com o motivo), a checagem prévia (Graph, permissões concedidas ao app, SharePoint Admin e banco) e o log ao vivo; no fim, o log completo para download. Um workload que falha não derruba os outros: a coleta termina como *Concluída com alertas*. Erros comuns (AADSTS, permissão, firewall, login do banco) aparecem traduzidos para a ação a tomar. Se o worker cair, depois de 10 minutos sem sinal a coleta volta para a fila e o coletor **retoma de onde parou**, sem varrer de novo os sites já concluídos (até 4 tentativas).
4. **Relatório**: páginas nativas por área (Visão geral, SharePoint, OneDrive, Licenciamento, Adoção, Exchange, Intune), com achados priorizados e recomendação, economia estimada, comparação entre duas execuções, tabelas com busca e exportação CSV, e o **relatório executivo** (2–3 páginas A4) para entregar ao cliente via Imprimir/PDF. O `dashboard.html` original continua acessível como "dashboard clássico".

Antes da primeira coleta, use **Diagnóstico completo** na aba de conexão do cliente: ele roda no worker e testa credencial (inclusive certificado), Graph, permissões, SharePoint Admin e banco.

## Estrutura

```
portal/                 Next.js 15 (App Router, Server Actions) · Auth.js v5 · Prisma (SQL Server)
  prisma/               schema e migrações do banco do portal
  sql/tenant/           schema dos bancos de clientes (001 = docs/SCHEMA.sql do ct-assessmentspo)
  assets/dashboard.html dashboard do coletor (cópia sem alterações)
  src/lib/dashboard.ts  porte para TypeScript das APIs do Start-Monitor.ps1 (procedures sp_dash_*)
  src/lib/jobs.ts       onde a coleta roda: queue (produção) | aca | docker | manual
  src/app/api/jobs/     fila (claim) e canal da coleta com o portal (configuração e progresso, token HMAC)
job/
  src/                  coletor (connection, modules, utils) — mantido neste repositório
  Invoke-SaasAssessment.ps1  roda UMA coleta (substitui o main.ps1 e o monitor local)
  Start-Worker.ps1      pede trabalho ao portal (coleta ou lote) e roda; -Once = um trabalho por container
  Invoke-SaasBatches.ps1  coleta de arquivos dividida em lotes paralelos
  Dockerfile            PowerShell 7.4 + PnP.PowerShell
infra/main.bicep        Azure SQL + elastic pool, Key Vault, ACR, Container Apps (portal + job do coletor), Log Analytics
infra/deploy.sh         implantação completa (infra + build das imagens no ACR)
```

### Como o coletor conversa com o portal

O coletor roda como **Container Apps Job disparado pela fila**: a cada 30 s uma regra KEDA `mssql` conta, no banco do portal, o trabalho pendente mais o que já está rodando, e o Azure sobe uma execução (um container, 2 vCPU / 4 GiB) para cada trabalho novo, até `maxCollectors`. Sem trabalho, nada fica ligado. Publicar uma versão nova não interrompe execuções em andamento.

Cada container chama `POST /api/jobs/claim` com o `WORKER_TOKEN` e recebe **um** trabalho: `ASSESSMENT_ID`, `CALLBACK_URL`, `CALLBACK_TOKEN` (HMAC do id da execução) e, se for um lote de uma coleta dividida, `TASK_ID`. Com eles, o `Invoke-SaasAssessment.ps1`:

- `GET /api/jobs/<id>` devolve a configuração no formato do `auth.json` + `params.json` do coletor, incluindo a credencial do M365 (lida do Key Vault) e a do banco do cliente.
- `POST /api/jobs/<id>`, a cada 10 s, envia o `global_status.json` e as linhas novas do log; no fim, o resultado.

**Coleta dividida em lotes**: com mais de 60 sites, depois da lista de sites a coleta reparte arquivos e lixeira em lotes de até 40 sites (sites muito grandes ficam sozinhos) e registra os lotes no portal (`/api/jobs/<id>/tasks`). Outros containers pegam lotes até o teto da coleta ("Containers em paralelo" na tela de execução; padrão 4) e a própria coleta também trabalha enquanto espera. A página da execução mostra lotes, sites concluídos e containers ativos. Lote sem sinal por 10 min volta para a fila; cada site tem progresso próprio no banco do cliente, então só o que faltou é refeito.

O token só é aceito enquanto a execução está ativa. Nenhum segredo de cliente fica na imagem, na configuração do worker ou em disco (o `.pfx` vai para um arquivo temporário apagado no fim). Cancelar no portal encerra o processo da coleta no próximo envio de progresso.

## Desenvolvimento local

```bash
docker compose up -d db
```

```bash
docker exec -it $(docker compose ps -q db) /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P 'Troque-esta-senha1' -Q "CREATE DATABASE ctassessment_portal"
```

```bash
cd portal && cp .env.example .env    # preencha BOOTSTRAP_ADMIN_EMAIL/PASSWORD, SECRETS_KEY
```

```bash
npm install && npx prisma migrate deploy && npm run admin:bootstrap && npm run dev
```

```bash
docker build -t ctassessment-job:dev job    # coletor; com JOB_RUNNER=docker o portal roda "docker run" por coleta
```

Com `JOB_RUNNER=manual` o portal mostra, na página da execução, o comando para rodar o coletor em qualquer máquina com acesso ao portal (com Docker ou com `pwsh` + PnP.PowerShell), útil para rodar dentro da rede do cliente.

## Implantação no Azure

```bash
az login
```

```bash
export RG=rg-ctassessment LOCATION=brazilsouth SQL_ADMIN_PASSWORD='...' AUTH_SECRET="$(openssl rand -base64 33)" JOB_SIGNING_SECRET="$(openssl rand -base64 33)" WORKER_TOKEN="$(openssl rand -base64 33)"
```

```bash
export BOOTSTRAP_ADMIN_EMAIL=voce@cloudtarget.com.br BOOTSTRAP_ADMIN_PASSWORD='...'   # opcional: 1º administrador
```

```bash
infra/deploy.sh
```

Guarde `AUTH_SECRET` e `JOB_SIGNING_SECRET`: trocá-los derruba as sessões e invalida execuções em andamento. O script imprime a URL do portal e a **Redirect URI** do login Microsoft. Para habilitar o login Microsoft 365, crie no Entra ID da Cloud Target um App Registration multi-tenant ("contas em qualquer diretório organizacional"), com essa Redirect URI, e rode de novo com `ENTRA_CLIENT_ID` e `ENTRA_CLIENT_SECRET`.

Recursos criados: Azure SQL (banco do portal S0 + elastic pool Standard 50 eDTU para os clientes), Key Vault (access policy só para a identidade do portal), ACR (usuário admin), Container Apps Environment, Container App do portal e o **job do coletor** disparado pela fila (`<prefix>-coletor`; `maxCollectors` = máximo de containers ao mesmo tempo, padrão 10; `collectorTimeoutSeconds` = tempo máximo de um container, padrão 24 h). Ambientes criados antes desta versão têm um worker sempre ligado (`<prefix>-worker`): rode o deploy com `REMOVE_OLD_WORKER=1` depois que as coletas dele terminarem. **Nenhuma atribuição de papel (RBAC) é criada**: basta Contributor no resource group.

## O coletor

O coletor (`job/src`) veio do ct-assessmentspo on-premises e agora é mantido **só aqui**: corrija e evolua neste repositório. Mudanças no banco dos clientes entram como migração incremental idempotente em `portal/sql/tenant` (`NNN_nome.sql`), aplicada pelo portal antes de cada coleta.

## Higienização

Ações que **alteram** o tenant do cliente, a partir do que o assessment encontrou. Sempre começam em simulação.

**No portal**: aba **Higienização** do cliente (Administrador e Executor; nunca automática). Escolha quantas versões manter, o escopo (tenant inteiro ou sites selecionados, com estimativa por site a partir da última coleta), lixeira ou exclusão permanente (por arquivo ou job do SharePoint) e, opcionalmente, um limite de arquivos para piloto. **Simular** não altera nada e mostra o resultado arquivo a arquivo; da simulação, "Executar com estes parâmetros" reabre o formulário preenchido. **Executar** exige confirmar o escopo, e a exclusão permanente exige digitar EXCLUIR. Cada disparo grava auditoria (`HYGIENE_SIMULATE` / `HYGIENE_EXECUTE`). A execução roda no worker como `kind = HIGIENIZACAO` (`job/Invoke-SaasHygiene.ps1`).

### Limpeza de versões antigas — `job/hygiene/Invoke-VersionCleanup.ps1`

Mantém as N versões mais recentes de cada arquivo (contando a atual) e apaga as mais antigas.

- **Candidatos** vêm da última coleta (arquivos com número de versão maior que N); a **simulação** lê as versões reais de cada um no SharePoint e informa exatamente quantas versões sairiam e quanto espaço libera — sem alterar nada.
- **Modo `PorArquivo`** (padrão): apaga só nos arquivos candidatos; por padrão as versões vão para a **lixeira** do site (recuperáveis; o espaço é liberado quando a lixeira for esvaziada). `-SemLixeira` exclui de forma permanente.
- **Modo `JobSharePoint`**: enfileira o job oficial de *trim* do SharePoint para o site inteiro — rápido em sites grandes, mas **permanente** (não passa pela lixeira).
- Nunca toca a Preservation Hold Library nem a versão atual; arquivos com rótulo de retenção ficam de fora por padrão.
- Resultado por arquivo em CSV (`-OutDir`) e no banco do cliente (`dbo.hygiene_runs` / `dbo.hygiene_version_items`).

Uso avulso, com o `auth.json` do ct-assessmentspo (Sites.FullControl.All com certificado):

```powershell
pwsh -File job/hygiene/Invoke-VersionCleanup.ps1 -AuthFile ./auth.json -SiteUrl https://contoso.sharepoint.com/sites/financeiro -ManterVersoes 100 -OutDir ./saida
```

```powershell
pwsh -File job/hygiene/Invoke-VersionCleanup.ps1 -AuthFile ./auth.json -SiteUrl https://contoso.sharepoint.com/sites/financeiro -ManterVersoes 100 -Acao Executar -OutDir ./saida
```
