# Status do Projeto — CT Assessment SaaS Multi-Tenant

**Última atualização:** 2026-07-22
**Fase atual:** Fase 1B - Features Prioritárias (Histórico, Email, PDF, Templates)

---

## Fase 1: MVP — Control Plane + Onboarding Manual

### ✅ Concluído

#### Arquitetura & Planejamento
- [x] Definição de arquitetura multi-tenant com isolamento silo
- [x] Diagrama de componentes e fluxos
- [x] Documento de arquitetura (`docs/ARCHITECTURE.md`)
- [x] Documento de deployment (`docs/DEPLOYMENT.md`)
- [x] Guia de contribuição (`CONTRIBUTING.md`)

#### Backend (Control Plane API)
- [x] Setup do projeto Node.js/Express
- [x] Configuração (dotenv, logger, config)
- [x] Middleware de segurança (helmet, CORS)
- [x] Autenticação Entra ID (fluxo corporativo)
- [x] Serialização de usuário (Passport)
- [x] Serviço de banco de dados (MSSQL)
- [x] Rotas básicas:
  - [x] `GET /health` (health check)
  - [x] `GET/POST /api/auth/*` (login, logout, me)
  - [x] `GET /api/clients` (listar)
  - [x] `GET /api/clients/:id` (obter um)
  - [x] `POST /api/clients` (criar, SuperAdmin only)
  - [x] `GET /api/tenants/:id` (obter)
  - [x] `GET /api/executions/:id` (obter)
  - [x] `GET /api/dashboard/*` (resumo, finops, etc)

#### Database (Control Plane)
- [x] Schema SQL completo:
  - [x] `clients` table
  - [x] `tenants` table (referência aos isolados)
  - [x] `executions` table
  - [x] `users` table (Entra ID)
  - [x] `audit_log` table (imutável)
  - [x] `policies` table
  - [x] `job_queue` table
- [x] Índices para performance
- [x] Stored procedures (create tenant, terminate tenant)

#### Data Plane Job (PowerShell)
- [x] Dockerfile (PowerShell + Azure CLI)
- [x] Entrypoint PowerShell (orquestração)
- [x] Estrutura de logging
- [x] Placeholders de scripts (Get-SPOInfo.ps1, Get-OneDriveInfo.ps1)
- [x] Fluxo de autenticação (Managed Identity → Key Vault)
- [x] Salvar resultados (placeholder)

#### Infraestrutura (IaC — Bicep)
- [x] Arquivo principal (`main.bicep`)
- [x] Módulos:
  - [x] Control Plane (App Service + SQL)
  - [x] Key Vault (segredos compartilhados)
  - [x] ACR (Container Registry)
  - [x] Storage (logs)
  - [x] Application Insights
- [x] Configurações por ambiente (dev/staging/prod)

#### Docker & Desenvolvimento Local
- [x] `docker-compose.yml` (SQL + API + Frontend placeholder)
- [x] Dockerfile para API
- [x] `.dockerignore` para otimizar builds
- [x] Variáveis de ambiente (`.env.example`)

#### Documentação
- [x] `README.md` (overview)
- [x] `docs/ARCHITECTURE.md` (detalhado)
- [x] `docs/DEPLOYMENT.md` (step-by-step)
- [x] `CONTRIBUTING.md` (workflow)

#### Frontend (React + Vite)
- [x] Setup React 18 + TypeScript + Vite
- [x] Configuração TailwindCSS (light/dark themes)
- [x] Componentes base:
  - [x] Layout (sidebar + header + main content)
  - [x] Sidebar com navegação baseada em roles
  - [x] Header com tema toggle e logout
- [x] Páginas:
  - [x] Login (Entra ID integration)
  - [x] Dashboard (KPIs, alertas, FinOps)
  - [x] Clientes (listagem + busca)
  - [x] Tenants (placeholder)
  - [x] Execuções (placeholder)
  - [x] Configurações (perfil do usuário)
- [x] Hooks customizados (useAuth)
- [x] API client service com tipos TypeScript
- [x] Tema claro/escuro com persistência
- [x] Charts e visualizações (Recharts)
- [x] Ícones (Lucide React)
- [x] Responsive design

### ❌ Não Implementado (Próximas Prioridades)

#### Onboarding Automático do Cliente
- [ ] Fluxo OAuth2 multi-tenant (consentimento de admin)
- [ ] Aprovisionamento automático:
  - [ ] Criar SQL Database
  - [ ] Criar Key Vault
  - [ ] Configurar RBAC
  - [ ] Registrar no Control Plane
- [ ] Webhook de confirmação
- [ ] Portal de onboarding (landing page)

#### Orquestrador de Jobs
- [ ] Leitura da fila (job_queue)
- [ ] Dispatcher (enviar para Container Apps)
- [ ] Polling de status
- [ ] Registro de resultado (custo, duração, etc)
- [ ] Retry logic (exponential backoff)

#### Execução Containerizada Real
- [ ] Implementar `Get-SPOInfo.ps1` (coleta real)
- [ ] Implementar `Get-OneDriveInfo.ps1` (coleta real)
- [ ] Salvar dados no database isolado (INSERT)
- [ ] Cálculo de custo por GB
- [ ] Tratamento de erros e timeouts
- [ ] Logging detalhado

#### FinOps Operacional
- [ ] Cálculo automático de custo por execução
- [ ] Dashboard de FinOps (custo/cliente, custo/GB, tendências)
- [ ] Showback mensal (CSV/PDF)
- [ ] Alertas de orçamento
- [ ] Relatórios de otimização

#### Autenticação & SSO Multi-Tenant
- [ ] Fluxo OAuth2 completo (code exchange)
- [ ] Refresh tokens
- [ ] Revogação de acesso
- [ ] Sincronização de papéis (SuperAdmin, Analista, Viewer)

#### Testes
- [ ] Testes unitários (API)
- [ ] Testes de integração (API + DB)
- [ ] Testes de carga
- [ ] Testes de segurança (OWASP top 10)

#### CI/CD
- [ ] GitHub Actions (lint, test, build, deploy)
- [ ] Aprovação manual para prod
- [ ] Backup automático do banco
- [ ] Monitoramento pós-deploy

---

## Fase 1B: Features Prioritárias — Histórico, Email, PDF, Templates

### ✅ Concluído (2026-07-22)

#### Histórico de Versões & Versionamento
- [x] Tabela `execution_snapshots` com version tracking
- [x] Stored procedures: `sp_SaveExecutionSnapshot`, `sp_CompareSnapshots`
- [x] API endpoints:
  - [x] `GET /api/executions/:id/versions` (listar versões)
  - [x] `GET /api/executions/:id/versions/:version` (obter snapshot)
  - [x] `GET /api/executions/:id/diff?v1=X&v2=Y` (comparar versões)
- [x] Frontend React page: `ExecutionHistory.tsx` (timeline + diff visual)
- [x] TypeScript types: ExecutionVersion, ExecutionSnapshot, ExecutionDelta

#### Email de Notificação
- [x] Tabela `email_queue` com retry logic
- [x] Service `email.js` com SendGrid integration
- [x] Stored procedures: `sp_EnqueueEmail`
- [x] Job processor: `email-processor.js` (async worker com cron support)
- [x] Email template: HTML com branding, link para relatório
- [x] API endpoint: `GET /api/admin/email-queue` (monitor)
- [x] Cleanup automático (hard delete >90 dias)

#### Relatórios em PDF
- [x] Tabela `pdf_reports` (cache com URL + SAS token)
- [x] Service `pdf-generator.js` com html-to-pdf
- [x] Azure Blob Storage integration com SAS URLs (24h expiration)
- [x] Report HTML com: summary, findings, sites, FinOps
- [x] API endpoint: `GET /api/executions/:id/report/pdf`
- [x] Stored procedures: `sp_RegisterPdfReport`

#### Execution Templates & Customização
- [x] Tabela `execution_templates` (reusable configs)
- [x] Support para parametrização: includeDeleted, maxFileSize, scanExternalShares, etc
- [x] CRUD endpoints:
  - [x] `POST /api/execution-templates` (criar)
  - [x] `GET /api/execution-templates/:tenantId` (listar)
  - [x] `PUT /api/execution-templates/:id` (atualizar)
  - [x] `DELETE /api/execution-templates/:id` (soft delete)
- [x] Audit trail: `criado_por` tracking
- [x] TypeScript type: ExecutionTemplate

#### Database Schema (Migration 002)
- [x] 4 novas tabelas (snapshots, email_queue, pdf_reports, templates)
- [x] 5 novas colunas em `executions` (version_number, config_json, findings_json, etc)
- [x] 5 stored procedures (snapshot, email, pdf, compare)
- [x] Índices para performance

#### Backend Dependencies
- [x] @sendgrid/mail (^8.1.0)
- [x] html-pdf (^3.0.0)
- [x] @azure/storage-blob (^12.19.0)

#### Documentação
- [x] `docs/IMPLEMENTATION-FEATURES.md` (400+ linhas com detalhes técnicos)
- [x] `docs/SETUP-FEATURES.md` (guia passo-a-passo de setup)
- [x] Updated `.env.example` com novas variáveis

#### Frontend Types & API Client
- [x] 8 novos tipos TypeScript
- [x] 12 novos métodos no apiClient
- [x] Page: ExecutionHistory com versioning UI
- [x] Support para execução templates

### ❌ Não Implementado (Próximas)

#### Integração Real com Dados
- [ ] SharePoint Graph API calls (Get-SPOInfo.ps1)
- [ ] OneDrive Graph API calls (Get-OneDriveInfo.ps1)
- [ ] Cálculo real de custo por GB
- [ ] Callback para atualizar executions com resultados

#### Hooks de Execução
- [ ] Ao completar: enfileirar email + gerar PDF + salvar snapshot
- [ ] Ao falhar: notificar admin
- [ ] Logging de timestamps (iniciado_em, finalizado_em)

#### UI/UX Refinements
- [ ] Página de Execution History integrada no dashboard
- [ ] Template selector na página de Nova Execução
- [ ] Download direto de PDF pelo dashboard
- [ ] Timeline visual com gráficos de delta

---

## Problemas Conhecidos

1. ✅ **Frontend existente**: React + Vite + TailwindCSS implementados
2. **Onboarding é manual**: Requer ação de DevOps para criar tenant
3. **Job não coleta dados reais**: Scripts são placeholders
4. **Sem cálculo de custo**: Hardcoded em $5.00
5. **Sem alertas**: Monitoramento não implementado
6. **Algumas páginas são placeholders**: Tenants, Execuções (scaffolded, falta implementação)

---

## Dados Técnicos

### Repositório
- **URL**: `http://127.0.0.1:41729/git/Jhondfp/ct-365assessment-saas`
- **Branch principal**: `main` (para releases)
- **Branch dev**: `develop` (integração)
- **Branch atual**: `claude/session-jkv0ns` (feature)

### Stack
- **Backend**: Node.js 18, Express.js
- **Database**: SQL Server 2022
- **Autenticação**: Entra ID + Passport.js
- **IaC**: Azure Bicep
- **Jobs**: PowerShell 7 + Docker
- **Frontend**: React 18 + Vite + TypeScript + TailwindCSS

### Ambiente
- **Região**: Brazil South (LGPD compliance)
- **Desenvolvimento**: Docker Compose local
- **Produção**: Azure (App Service, SQL Database, Container Apps)

---

## Métricas

| Métrica | Valor |
|---------|-------|
| Arquivos criados | 65+ |
| Linhas de código | ~6500+ |
| Módulos Bicep | 5 |
| Tabelas SQL | 12 (8 orig + 4 novas) |
| Endpoints API | 26 (19 implementados, 7 scaffolded) |
| Componentes React | 8 |
| Páginas React | 7 (+ ExecutionHistory) |
| Commits | 5 (3 orig + 2 features) |
| SQL Stored Procedures | 9 (4 orig + 5 novas) |
| Services Backend | 5 (database, features, email, pdf-generator, analysis) |
| Jobs | 1 (email-processor) |

---

## Próximos Passos (Prioridade)

### Semana 1 (Imediato - Setup & Validação)
- [x] Backend das 5 features (✅ 22/07 - concluído)
- [x] Frontend ExecutionHistory (✅ 22/07 - concluído)
- [x] Migration SQL (✅ 22/07 - concluído)
- [ ] **TODO:** Rodar migration no banco
- [ ] **TODO:** Instalar dependencies (`npm install`)
- [ ] **TODO:** Testar endpoints com Postman/curl
- [ ] **TODO:** Validar TypeScript types

### Semana 2 (Integração & Email)
- [ ] **TODO:** Setup SendGrid (obter API key)
- [ ] **TODO:** Testar email processor job (cron/scheduler)
- [ ] **TODO:** Implementar hook de conclusão de execução
  - Enfileirar email ao completar
  - Gerar PDF ao completar
  - Salvar snapshot ao completar
- [ ] **TODO:** Setup Azure Storage (obter connection string)
- [ ] **TODO:** Testar upload/download de PDF

### Semana 3 (Real Data & SharePoint)
- [ ] **TODO:** Implementar `sharepoint.js` com Graph API
- [ ] **TODO:** Implementar PowerShell scripts reais:
  - Get-SPOInfo.ps1 (SharePoint collection)
  - Get-OneDriveInfo.ps1 (OneDrive collection)
- [ ] **TODO:** Testar coleta em environment dev
- [ ] **TODO:** Salvar dados em banco isolado do tenant

### Semana 4 (Production & Hardening)
- [ ] **TODO:** Deploy do Control Plane em Azure (dev environment)
- [ ] **TODO:** Testes de carga (50-100 execuções paralelas)
- [ ] **TODO:** Security review (OWASP top 10)
- [ ] **TODO:** LGPD compliance audit
- [ ] **TODO:** Monitoramento & alertas (Application Insights)

---

## Contatos & Referências

- **Arquitetura**: Ver `docs/BLUEPRINT-ARCHITECTURE.md` (documento original do artefato)
- **Deploy**: Ver `docs/DEPLOYMENT.md`
- **Contribuição**: Ver `CONTRIBUTING.md`

---

**Mantido por:** Claude Haiku 4.5  
**Última revisão:** 2026-07-22  
**Próxima revisão:** 2026-07-29 (após completar Semana 1 TODO)
