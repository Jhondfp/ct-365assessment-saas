# CT Assessment 365 SaaS

Coletor de governança Microsoft 365 em SaaS (PowerShell + PnP + SQL Server). Nasceu do **ct-assessmentspo** (on-premises), que será descontinuado: **o coletor agora vive e evolui aqui**. Portal no padrão do **Target360** (repositório Ct-crm): mesmo layout (Sidebar, `ui.tsx`, `globals.css`, Poppins, cores `ct-*`) e mesma autenticação mista (Entra ID + login local + login de desenvolvimento). Visão geral e operação: `README.md`.

## Decisões que não mudam sem conversar com o usuário

- **Tudo em SQL Server / Azure SQL**: banco do portal via Prisma (`portal/prisma`) e **1 banco por cliente** (silo) com o schema do ct-assessmentspo (`portal/sql/tenant`). O banco do cliente é `MANAGED` (criado pelo portal no servidor `TENANT_SQL_*`) ou `EXTERNAL` (banco existente em qualquer servidor; senha no cofre). Sempre resolva a conexão por `clientConn()` (`src/lib/clientDb.ts`); nunca rode o `001` (DROP + CREATE) em banco que não esteja vazio. Banco `MANAGED` provisionado ganha um **usuário contido próprio** (`app_<slug>`: só `db_datareader`, `db_datawriter` e `EXECUTE`, senha `dbapp` no cofre), usado pelo portal e pelo coletor; o admin do servidor fica só para criar o banco e aplicar migrações (`clientConn(c, { admin: true })`). Bancos `EXTERNAL`/legados continuam como estão. A regra de escala do coletor lê a fila com `queue_reader` (só `SELECT` em `Assessment`/`AssessmentTask`, criado por `scripts/ensure-queue-reader.mjs` no início do portal).
- **App Registration do cliente** (não do SaaS): tenant id, client id, prefixo do SharePoint e certificado `.pfx` ou client secret por cliente, guardados no Key Vault (`src/lib/secrets.ts`).
- **Coleta por fila** (`JOB_RUNNER=queue`): o coletor é um **Container Apps Job disparado pela fila** (`<prefix>-coletor`, regra KEDA `mssql` que conta no banco do portal o trabalho em andamento + o pendente; o KEDA (estratégia default) desconta as execuções que já rodam e dispara a diferença). Cada execução do job roda `job/Start-Worker.ps1 -Once`: pega **um** trabalho em `/api/jobs/claim` (uma coleta ou um lote), roda e termina; publicar versão nova não interrompe execuções em andamento. Trabalho sem sinal por 10 min volta para a fila e é retomado (resume do coletor); a interface mostra "Interrompida · aguardando retomada" (`isStalled`).
- **Coleta dividida em lotes** (`AssessmentTask`, `src/lib/tasks.ts`, `job/Invoke-SaasBatches.ps1`): com mais de 60 sites, arquivos e lixeira viram lotes de até 40 sites (sites grandes sozinhos); outros containers pegam lotes até o teto da coleta (`params.files_containers`, tela de execução) e a própria coleta trabalha enquanto espera. Cada site tem progresso próprio em `dbo.execution_progress`, então pegar de novo um lote só refaz o que faltou.
- Escolhido para **não depender de papéis RBAC no Azure** (o usuário só tem Contributor): nada no Bicep cria role assignment, o ACR usa usuário admin e o Key Vault usa access policies. `aca`, `docker` e `manual` continuam disponíveis em `src/lib/jobs.ts`.
- **Só a equipe Cloud Target acessa** nesta fase. Perfis: ADMIN (tudo), EXECUTOR (cadastra clientes e executa coletas), VISUALIZADOR (só os clientes liberados em `UserClient`). Ver `src/lib/rbac.ts` e `src/lib/session.ts` (`canSeeClient`, `clientWhere`, `assessmentWhere`).
- **Google Workspace** (`Client.platform = GOOGLE`): levantamento para migração ao M365, só leitura, conta de serviço do cliente com delegação em todo o domínio (chave JSON no cofre, `gsa`). Coletor em `job/google/` (tabelas `g_*`, migração tenant 003), relatório em `components/report/GoogleReport.tsx` + `src/lib/googleReport.ts` (licença sugerida, ondas, exportação para o Archie). Guias de acesso copiáveis para o cliente (M365 e Google) em `src/lib/setupGuides.ts`.
- **Workload de agendas/reuniões removido** da interface: `process_calendar` vai sempre `false`.

## Regras de código

- **`job/src/` é o código do coletor** (veio do ct-assessmentspo, que não é mais sincronizado nem mantido). Corrija e evolua aqui mesmo. `job/Invoke-SaasAssessment.ps1` é o entrypoint (equivale ao `main.ps1` antigo); mudanças de banco do coletor entram como migração incremental em `portal/sql/tenant`.
- O coletor depende da pasta atual: os runspaces paralelos resolvem `src\...`, `.\src\progress` e `logs\` a partir da raiz do job. Mantenha a estrutura.
- `portal/assets/dashboard.html` é o dashboard clássico herdado do coletor. A rota `src/app/relatorio/[clientId]/route.ts` só reaponta URLs; se o arquivo mudar, `replaceOnce` acusa o trecho que não encontrou.
- `src/lib/dashboard.ts` é o porte das funções do `Start-Monitor.ps1`: mesmo formato de JSON que o dashboard consome. O relatório nativo (`app/(app)/clientes/[id]/relatorio`, `components/report`) usa esse JSON; regras de negócio (economia, licenças ociosas, achados) ficam em `src/lib/insights.ts`. Gráficos em `components/charts.tsx` seguem a paleta validada (roxo da marca, azul, laranja; status só para estado).
- O job isola cada workload (`Invoke-Workload` no entrypoint) e reporta `workloads`/`preflight` ao portal; status final `completed | partial | failed`. Execuções `kind = DIAGNOSTICO` rodam só a checagem prévia e ficam fora das listagens (`assessmentWhere` filtra `COLETA`).
- Retomada: `Initialize-CollectorIndexes` cria no job os índices `(execution_id, site_url)` de `files_info`/`trash_items` (bancos antigos não têm); `Clear-PartialSiteData` limpa só os sites com linhas parciais e, se a limpeza falhar, `Remove-DuplicateSiteRows` deduplica no fim do módulo.
- O coletor roda com StrictMode: o entrypoint completa `auth`/`params` com as chaves padrão dos `*.example.json`. Nunca envolva o retorno de `Invoke-DbReader` em `@()` (ele já devolve array).
- **Higienização** (`job/hygiene/`) ALTERA o tenant do cliente: simular é sempre o padrão, execução exige confirmação (`SupportsShouldProcess`), nada toca a Preservation Hold Library nem a versão atual, e cada item vai para `dbo.hygiene_version_items` (migração tenant 002). Limpeza de versões: modo `PorArquivo` (padrão, versões vão para a lixeira) ou `JobSharePoint` (trim do servidor, permanente).
- **Excluir coleta** (só Administrador, `assessments:delete`): a coleta fica `EXCLUINDO` (some do relatório) e uma execução `kind = EXCLUSAO` roda `job/Invoke-SaasDelete.ps1`, que apaga em lotes todas as tabelas da coleta no banco do cliente (`execution_history` por último). Concluída, o portal apaga a coleta; se falhar, ela volta ao status anterior.
- Server actions seguem o padrão do Target360: função `async` privada + `export const x = act(x_)`. Nunca exporte helper de um arquivo `"use server"` (vira endpoint público); helpers vão para `src/lib`.
- Toda action de cliente checa `requireClientPerm(clientId, perm)`; toda página de cliente, `requireClientPage`. Alterações relevantes gravam `audit(...)`.
- Schema dos clientes: `001_schema.sql` faz DROP + CREATE e só roda em banco vazio (banco com o schema é adotado). Mudanças novas = migração incremental `NNN_nome.sql` idempotente.
- Textos de interface em português (pt-BR).

## Validação

```bash
cd portal && npx tsc --noEmit && npx next build
```

```bash
pwsh -NoProfile -c 'Get-ChildItem job -Recurse -Filter *.ps1 | % { $e=$null; [System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$null,[ref]$e) | Out-Null; $e }'
```

```bash
bicep build infra/main.bicep --stdout > /dev/null
```

```bash
pwsh -File job/tests/Test-Pipeline.ps1   # pipeline do entrypoint sob StrictMode, com Graph/PnP/banco simulados
```

```bash
pwsh -File job/tests/Test-VersionCleanup.ps1   # higienização: limpeza de versões, SharePoint/banco simulados
```

```bash
pwsh -File job/tests/Test-Delete.ps1   # exclusão de coleta: lotes, tabelas inexistentes, falha
```

```bash
pwsh -File job/tests/Test-Resume.ps1   # retomada: limpeza só de sites com linhas parciais, deduplicação, índices
```

```bash
pwsh -File job/tests/Test-Google.ps1   # coletor Google Workspace: token, paginação, módulos, APIs simuladas
```

Teste de ponta a ponta local: `docker compose up -d db`, portal com `JOB_RUNNER=docker` e a imagem `ctassessment-job:dev`. Cadastre um cliente com "criar o banco agora" e rode uma coleta. Sem um tenant M365 real, a coleta falha no token do Graph, mas valida o disparo, o callback, o log e o status.

## Pendências conhecidas

- Billing/créditos (existiam no esqueleto anterior; ficaram fora desta versão).
- Agendamento recorrente de coletas.
- Teste com tenant Microsoft 365 real (certificado + PnP no container Linux).
- Portal com mais de uma réplica: os pools de conexão por banco de cliente são em memória (funciona, mas cada réplica abre os seus).
