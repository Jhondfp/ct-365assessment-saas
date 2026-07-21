# Status do Projeto — CT Assessment SaaS Multi-Tenant

**Última atualização:** 2026-07-21
**Fase atual:** Fase 1 - MVP (Estrutura + API Base)

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
| Arquivos criados | 56+ |
| Linhas de código | ~4000+ |
| Módulos Bicep | 5 |
| Tabelas SQL | 8 |
| Endpoints API | 12 (5 implementados, 7 scaffolded) |
| Componentes React | 8 |
| Páginas React | 6 |
| Commits | 3 |

---

## Próximos Passos (Prioridade)

### Semana 1
- [x] Frontend React básica (✅ concluído)
- [x] Dashboard com dados (✅ skeleton implementado)
- [ ] Integração frontend ↔ API (conectar dados reais)

### Semana 2
- [ ] Deploy do Control Plane em Azure (dev)
- [ ] Testes de conectividade SQL
- [ ] Setup de logging (Application Insights)
- [ ] Teste manual de login (Entra ID)

### Semana 3
- [ ] Onboarding automático (OAuth2)
- [ ] Provisioning de tenant (Bicep programático)
- [ ] Páginas Tenants e Execuções (implementação completa)

### Semana 4
- [ ] Execução containerizada real
- [ ] FinOps operacional com cálculos reais
- [ ] Testes de carga

---

## Contatos & Referências

- **Arquitetura**: Ver `docs/BLUEPRINT-ARCHITECTURE.md` (documento original do artefato)
- **Deploy**: Ver `docs/DEPLOYMENT.md`
- **Contribuição**: Ver `CONTRIBUTING.md`

---

**Mantido por:** Claude Haiku 4.5  
**Última revisão:** 2026-07-21
