# CT Assessment 365 — SaaS

Versão SaaS do [ct-assessmentspo](https://github.com/Jhondfp/ct-assessmentspo): o mesmo coletor PowerShell de governança de Microsoft 365 (SharePoint, OneDrive, licenças, adoção, Exchange, Intune), agora operado por um portal web. Cada cliente tem um **banco isolado** e cada coleta roda num **container próprio** no Azure.

O portal usa o mesmo layout e a mesma autenticação mista do **Target360** (Next.js 15 + Auth.js v5 + Prisma + Azure SQL): login com **Microsoft 365** (Entra ID multi-tenant) e login **local** (e-mail + senha).

```
                 ┌──────────────── Azure Container Apps ────────────────┐
 equipe CT ──►   │  portal (Next.js)            Container Apps Job      │
 (M365/senha)    │   ├ clientes, conexões  ──►  (1 execução por coleta)  │──► Microsoft 365 do cliente
                 │   ├ disparo e progresso ◄──  job/ = coletor PS + PnP  │    (Graph + SharePoint/PnP)
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

1. **Cadastrar o cliente** (Administrador/Executor): dados do cliente, App Registration do cliente (tenant, client id, prefixo do SharePoint, certificado `.pfx` ou client secret) e, opcionalmente, **criar o banco** na hora com o schema padrão do coletor. A credencial vai direto para o Key Vault e nunca é exibida de volta.
2. **Executar uma coleta**: escolher os workloads (sites, arquivos, lixeira, donos ativos, licenciamento, adoção, caixas de e-mail, Intune) e, se quiser, limitar a sites específicos. O portal inicia uma execução do Container Apps Job.
3. **Acompanhar**: etapas e log ao vivo na página da execução. Se o container cair, o Container Apps repete a execução e o coletor **retoma de onde parou**, sem varrer de novo os sites já concluídos.
4. **Dashboard**: o mesmo `dashboard.html` do ct-assessmentspo, servido pelo portal com escopo do cliente, com histórico de execuções e exportação PDF/HTML.

## Estrutura

```
portal/                 Next.js 15 (App Router, Server Actions) · Auth.js v5 · Prisma (SQL Server)
  prisma/               schema e migrações do banco do portal
  sql/tenant/           schema dos bancos de clientes (001 = docs/SCHEMA.sql do ct-assessmentspo)
  assets/dashboard.html dashboard do coletor (cópia sem alterações)
  src/lib/dashboard.ts  porte para TypeScript das APIs do Start-Monitor.ps1 (procedures sp_dash_*)
  src/lib/jobs.ts       disparo do job: aca | docker | manual
  src/app/api/jobs/     canal do job com o portal (configuração e progresso, token HMAC por execução)
job/
  src/                  coletor do ct-assessmentspo (connection, modules, utils) — cópia sem alterações
  Invoke-SaasAssessment.ps1  entrypoint SaaS (substitui o main.ps1 e o monitor local)
  Dockerfile            PowerShell 7.4 + PnP.PowerShell
infra/main.bicep        Azure SQL + elastic pool, Key Vault, ACR, Container Apps (portal + job), Log Analytics
infra/deploy.sh         implantação completa (infra + build das imagens no ACR)
scripts/sync-collector.sh  atualiza job/src, o dashboard e o schema a partir do ct-assessmentspo
```

### Como o job conversa com o portal

O container recebe só `ASSESSMENT_ID`, `CALLBACK_URL` e `CALLBACK_TOKEN` (HMAC do id da execução). Com eles:

- `GET /api/jobs/<id>` devolve a configuração no formato do `auth.json` + `params.json` do coletor, incluindo a credencial do M365 (lida do Key Vault) e a do banco do cliente.
- `POST /api/jobs/<id>`, a cada 10 s, envia o `global_status.json` e as linhas novas do log; no fim, o resultado.

O token só é aceito enquanto a execução está ativa. Nenhum segredo fica na imagem, no template do job ou em disco (o `.pfx` vai para um arquivo temporário apagado no fim).

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
export RG=rg-ctassessment LOCATION=brazilsouth SQL_ADMIN_PASSWORD='...' AUTH_SECRET="$(openssl rand -base64 33)" JOB_SIGNING_SECRET="$(openssl rand -base64 33)"
```

```bash
export BOOTSTRAP_ADMIN_EMAIL=voce@cloudtarget.com.br BOOTSTRAP_ADMIN_PASSWORD='...'   # opcional: 1º administrador
```

```bash
infra/deploy.sh
```

Guarde `AUTH_SECRET` e `JOB_SIGNING_SECRET`: trocá-los derruba as sessões e invalida execuções em andamento. O script imprime a URL do portal e a **Redirect URI** do login Microsoft. Para habilitar o login Microsoft 365, crie no Entra ID da Cloud Target um App Registration multi-tenant ("contas em qualquer diretório organizacional"), com essa Redirect URI, e rode de novo com `ENTRA_CLIENT_ID` e `ENTRA_CLIENT_SECRET`.

Recursos criados: Azure SQL (banco do portal S0 + elastic pool Standard 50 eDTU para os clientes), Key Vault com RBAC, ACR, Container Apps Environment, Container App do portal, Container Apps Job manual (2 vCPU/4 GiB, timeout de 12 h, 3 retries) e identidades gerenciadas com o mínimo de papéis (AcrPull, Key Vault Secrets Officer para o portal, Container Apps Jobs Operator no job).

## Atualizar o coletor

O coletor continua sendo desenvolvido no ct-assessmentspo. Para trazer uma versão nova:

```bash
scripts/sync-collector.sh ../ct-assessmentspo
```

Depois disso, confira se o bloco de módulos do `src/main.ps1` mudou (o `job/Invoke-SaasAssessment.ps1` espelha a ordem e as condições). Mudanças de schema entram como migração incremental em `portal/sql/tenant/NNN_*.sql`: o `001` faz DROP + CREATE e só roda em banco vazio.
