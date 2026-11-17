# CT Assessment 365 SaaS

Versão SaaS do coletor **ct-assessmentspo** (PowerShell + PnP + SQL Server). Portal no padrão do **Target360** (repositório Ct-crm): mesmo layout (Sidebar, `ui.tsx`, `globals.css`, Poppins, cores `ct-*`) e mesma autenticação mista (Entra ID + login local + login de desenvolvimento). Visão geral e operação: `README.md`.

## Decisões que não mudam sem conversar com o usuário

- **Tudo em SQL Server / Azure SQL**: banco do portal via Prisma (`portal/prisma`) e **1 banco por cliente** (silo) com o schema do ct-assessmentspo (`portal/sql/tenant`). O banco do cliente é `MANAGED` (criado pelo portal no servidor `TENANT_SQL_*`) ou `EXTERNAL` (banco existente em qualquer servidor; senha no cofre). Sempre resolva a conexão por `clientConn()` (`src/lib/clientDb.ts`); nunca rode o `001` (DROP + CREATE) em banco que não esteja vazio.
- **App Registration do cliente** (não do SaaS): tenant id, client id, prefixo do SharePoint e certificado `.pfx` ou client secret por cliente, guardados no Key Vault (`src/lib/secrets.ts`).
- **Coleta por fila** (`JOB_RUNNER=queue`): workers (`job/Start-Worker.ps1`, Container App sempre ligado) pedem coletas em `/api/jobs/claim`. Escolhido para **não depender de papéis RBAC no Azure** (o usuário só tem Contributor): nada no Bicep cria role assignment, o ACR usa usuário admin e o Key Vault usa access policies. `aca`, `docker` e `manual` continuam disponíveis em `src/lib/jobs.ts`.
- **Só a equipe Cloud Target acessa** nesta fase. Perfis: ADMIN (tudo), EXECUTOR (cadastra clientes e executa coletas), VISUALIZADOR (só os clientes liberados em `UserClient`). Ver `src/lib/rbac.ts` e `src/lib/session.ts` (`canSeeClient`, `clientWhere`, `assessmentWhere`).
- **Workload de agendas/reuniões removido** da interface: `process_calendar` vai sempre `false`.

## Regras de código

- **`job/src/` é cópia sem alterações do ct-assessmentspo** (`scripts/sync-collector.sh`). Não edite lá: corrija no ct-assessmentspo e sincronize. Adaptações para o SaaS ficam em `job/Invoke-SaasAssessment.ps1`, que espelha o bloco de módulos do `src/main.ps1`.
- O coletor depende da pasta atual: os runspaces paralelos resolvem `src\...`, `.\src\progress` e `logs\` a partir da raiz do job. Mantenha a estrutura.
- `portal/assets/dashboard.html` também é cópia do coletor. A rota `src/app/relatorio/[clientId]/route.ts` só reaponta URLs; se o arquivo mudar, `replaceOnce` acusa o trecho que não encontrou.
- `src/lib/dashboard.ts` é o porte das funções do `Start-Monitor.ps1`: mesmo formato de JSON que o dashboard consome. O relatório nativo (`app/(app)/clientes/[id]/relatorio`, `components/report`) usa esse JSON; regras de negócio (economia, licenças ociosas, achados) ficam em `src/lib/insights.ts`. Gráficos em `components/charts.tsx` seguem a paleta validada (roxo da marca, azul, laranja; status só para estado).
- O job isola cada workload (`Invoke-Workload` no entrypoint) e reporta `workloads`/`preflight` ao portal; status final `completed | partial | failed`. Execuções `kind = DIAGNOSTICO` rodam só a checagem prévia e ficam fora das listagens (`assessmentWhere` filtra `COLETA`).
- O coletor roda com StrictMode: o entrypoint completa `auth`/`params` com as chaves padrão dos `*.example.json`. Nunca envolva o retorno de `Invoke-DbReader` em `@()` (ele já devolve array).
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

Teste de ponta a ponta local: `docker compose up -d db`, portal com `JOB_RUNNER=docker` e a imagem `ctassessment-job:dev`. Cadastre um cliente com "criar o banco agora" e rode uma coleta. Sem um tenant M365 real, a coleta falha no token do Graph, mas valida o disparo, o callback, o log e o status.

## Pendências conhecidas

- Billing/créditos (existiam no esqueleto anterior; ficaram fora desta versão).
- Agendamento recorrente de coletas.
- Teste com tenant Microsoft 365 real (certificado + PnP no container Linux).
- Portal com mais de uma réplica: os pools de conexão por banco de cliente são em memória (funciona, mas cada réplica abre os seus).
