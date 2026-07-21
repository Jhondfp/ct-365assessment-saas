# Arquitetura — CT Assessment SaaS Multi-Tenant

## Visão Geral

A plataforma transforma a ferramenta "CT Assessment" de um script single-tenant (um cliente por execução) em um SaaS multi-tenant escalável, onde:

- **Control Plane**: Gerenciamento central de clientes, tenants, execuções e usuários
- **Data Planes**: Um banco de dados isolado por tenant (modelo "silo") — garantindo zero-sharing de dados entre clientes
- **Execução Elástica**: Jobs containerizados disparados sob demanda, em paralelo, sem competição por recursos

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                     INTERNET                                │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        │                             │
    ┌───▼──────────┐         ┌──────▼──────┐
    │ Browser      │         │ App (SSO)   │
    │ (Painel)     │         │ Onboarding  │
    └───┬──────────┘         └──────┬──────┘
        │                           │
        │    Entra ID (OAuth2/OIDC) │
        └──────────────┬────────────┘
                       │
        ┌──────────────▼────────────────────────────────────┐
        │                                                    │
        │   CONTROL PLANE (Centralizado, Multi-Tenant)     │
        │   ─────────────────────────────────────────────  │
        │                                                    │
        │  ┌─────────────────────────────────────────────┐ │
        │  │ Express.js API                              │ │
        │  │ ├─ GET  /api/clients                        │ │
        │  │ ├─ POST /api/executions (dispara job)      │ │
        │  │ ├─ GET  /api/dashboard/summary             │ │
        │  │ └─ GET  /api/dashboard/finops              │ │
        │  └─────────────────────────────────────────────┘ │
        │                                                    │
        │  ┌─────────────────────────────────────────────┐ │
        │  │ SQL Database (metadata apenas)               │ │
        │  │ ├─ clients                                  │ │
        │  │ ├─ tenants (referência aos isolados)       │ │
        │  │ ├─ executions (histórico + custo)           │ │
        │  │ ├─ users (Entra ID sync)                   │ │
        │  │ ├─ audit_log (imutável)                    │ │
        │  │ └─ job_queue (fila de processamento)       │ │
        │  └─────────────────────────────────────────────┘ │
        │                                                    │
        │  ┌─────────────────────────────────────────────┐ │
        │  │ Orchestrator (Application Service)          │ │
        │  │ - Lê job_queue                             │ │
        │  │ - Dispara Container Jobs (paralelo)        │ │
        │  │ - Registra resultado                       │ │
        │  └─────────────────────────────────────────────┘ │
        │                                                    │
        └───────────────────┬────────────────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    ┌───────▼──────┐  ┌────▼────────┐  ┌──▼────────────┐
    │ DATA PLANE A │  │ DATA PLANE B│  │ DATA PLANE C  │
    │ (Cliente 1)  │  │ (Cliente 2) │  │  (Cliente 3)  │
    ├──────────────┤  ├─────────────┤  ├───────────────┤
    │              │  │             │  │               │
    │ ┌──────────┐ │  │ ┌─────────┐ │  │ ┌───────────┐ │
    │ │ Key Vault│ │  │ │KeyVault │ │  │ │ KeyVault  │ │
    │ │ (creds)  │ │  │ │ (creds) │ │  │ │  (creds)  │ │
    │ └──────────┘ │  │ └─────────┘ │  │ └───────────┘ │
    │              │  │             │  │               │
    │ ┌──────────┐ │  │ ┌─────────┐ │  │ ┌───────────┐ │
    │ │   SQL DB │ │  │ │  SQL DB │ │  │ │   SQL DB  │ │
    │ │ (dados)  │ │  │ │ (dados) │ │  │ │  (dados)  │ │
    │ └──────────┘ │  │ └─────────┘ │  │ └───────────┘ │
    │              │  │             │  │               │
    │ ┌──────────┐ │  │ ┌─────────┐ │  │ ┌───────────┐ │
    │ │  Job     │ │  │ │  Job    │ │  │ │   Job     │ │
    │ │Container │ │  │ │Container│ │  │ │ Container │ │
    │ │(ephemeral)│ │  │ │(ephemeral)│  │ │(ephemeral) │
    │ └──────────┘ │  │ └─────────┘ │  │ └───────────┘ │
    │              │  │             │  │               │
    └──────────────┘  └─────────────┘  └───────────────┘
```

## Camadas

### 1. Control Plane (Centralizado)

**Responsabilidades:**
- Autenticação e autorização (Entra ID)
- Gerenciamento de clientes e tenants
- Orquestração de execuções
- Registro de auditoria
- Dashboard e relatórios
- FinOps (custo por execução)

**Tecnologia:**
- Node.js + Express
- SQL Server (banco central — multi-tenant, mas apenas metadados)
- Azure App Service
- Azure Key Vault (segredos compartilhados)

**Banco de Dados:**
```
control_plane (1 banco, centralizado)
├── clients (quem contratou)
├── tenants (referência a cada M365)
├── executions (histórico + custo)
├── users (Entra ID)
├── audit_log (imutável)
└── job_queue (fila de processamento)
```

### 2. Data Planes (Isolados por Tenant)

**Modelo: Silo (1 banco + 1 Key Vault por cliente)**

**Responsabilidades:**
- Guardar dados de SharePoint/OneDrive do cliente
- Gerenciar credenciais do tenant M365
- Executar coleta de dados
- Transformar e armazenar resultados

**Tecnologia:**
- SQL Server (1 database por tenant)
- Azure Key Vault (1 vault por tenant)
- Azure Container Apps Jobs (execução efêmera)

**Benefícios:**
- ✅ Isolamento físico (não lógico) — impossível um cliente ver dados do outro
- ✅ Performance isolada — execução de um cliente não afeta outro
- ✅ LGPD simples — direito ao esquecimento = deletar 1 banco
- ✅ Auditável — provável que dados não se cruzem
- ❌ Custo por cliente mais alto (mas justificável por segurança)

### 3. Job de Execução

**Fluxo:**
1. Usuário clica "Executar" no painel
2. Control Plane cria uma execução e enfileira job
3. Orquestrador lê fila, dispara container (Azure Container Apps Job)
4. Job:
   - Obtém credenciais do Key Vault (Managed Identity)
   - Autentica no SharePoint/OneDrive
   - Executa coleta (PowerShell)
   - Salva no database isolado
   - Envia métrica de custo/duração de volta
5. Job encerra (container descartado)
6. Control Plane registra conclusão

**Containerização:**
- Base: PowerShell em Alpine
- Volumes montados: logs, dados temporários
- Entrypoint: PowerShell que orquestra coleta
- Cleanup automático: container morre após conclusão

## Fluxos de Autenticação

### Fluxo 1: Login Corporativo (sua equipe → Painel)

```
┌─────────────┐         ┌────────────────┐         ┌──────────────────┐
│ Browser     │         │ Entra ID       │         │ Control Plane    │
│ (localhost) │         │ (single-tenant)│         │ (seu tenant)     │
└──────┬──────┘         └────────┬───────┘         └────────┬─────────┘
       │                         │                          │
       │─ Clica "Login" ────────→│                          │
       │                         │                          │
       │←─ Redireciona para form ─│                          │
       │                         │                          │
       │─ Email + senha ────────→│                          │
       │                         │                          │
       │  [Validação do Entra ID]│                          │
       │                         │                          │
       │←─ Redireciona com code  │                          │
       │                         │                          │
       │─ POST /callback code ──────────────────────────→  │
       │                         │                          │
       │                         │  [Troca code por token]  │
       │                         │←───────────────────────  │
       │                         │                          │
       │←─ Session cookie, redirect ─────────────────────  │
       │                         │                          │
       │─ GET /dashboard ───────────────────────────────→  │
       │                         │                          │
       │←─ Painel HTML ─────────────────────────────────  │
       │                         │                          │
```

**Fluxo técnico:**
1. `GET /api/auth/login` → Passport redireciona para Entra ID
2. `POST /api/auth/callback` → Passport valida, busca/cria usuário
3. Session armazenada em cookies (JWT ou session store)
4. Middleware `requireAuth` valida todas as rotas

### Fluxo 2: Onboarding do Cliente (consent de admin)

```
┌─────────────┐         ┌────────────────┐         ┌──────────────────┐
│ Cliente     │         │ Entra ID       │         │ Control Plane    │
│ (browser)   │         │ (multi-tenant) │         │ (app registration)
└──────┬──────┘         └────────┬───────┘         └────────┬─────────┘
       │                         │                          │
       │─ Clica "Autorizar" ────────────────────────────→  │
       │                         │                          │
       │←─ Redireciona para Entra ID (prompt=admin_consent)
       │                         │                          │
       │  [Admin clica "Aceitar"]│                          │
       │                         │                          │
       │←─ Redireciona com code  │                          │
       │                         │                          │
       │─ POST /consent-callback code ──────────────────→  │
       │                         │                          │
       │                         │  [Troca code por token]  │
       │                         │←───────────────────────  │
       │                         │                          │
       │                         │  [API provisiona tenant] │
       │                         │  - Cria SQL Database     │
       │                         │  - Cria Key Vault        │
       │                         │  - Registra no CP        │
       │                         │←───────────────────────  │
       │←─ Sucesso ──────────────────────────────────────  │
       │                         │                          │
```

## Segurança: Isolamento em Ação

### Cenário: Cliente A tenta acessar dados do Cliente B

**Implementação de segurança em camadas:**

```
Camada 1: Autenticação
- Usuário autenticado via Entra ID
- Token vinculado ao client_id específico
- ✅ Usuário B não tem credentials do Client A

Camada 2: Autorização (Control Plane)
- Rota /api/clients/:clientId/tenants
- Middleware verifica: req.user.papel === 'superadmin' || cliente_atribuido
- ✅ Usuário B não tem permissão de ler dados de Client A

Camada 3: Isolamento de Dados (Data Plane)
- Client A → connection string = "Server=tenant-a.database.windows.net;Database=ct_tenant_a;..."
- Client B → connection string = "Server=tenant-b.database.windows.net;Database=ct_tenant_b;..."
- Mesmo se Client B conseguisse a connection string de A, seria SQL injection em seu próprio database
- ✅ Connection string não contém credencial de outro cliente

Camada 4: Credenciais (Key Vault)
- Key Vault A = https://tenant-a-kv.vault.azure.net/
- Key Vault B = https://tenant-b-kv.vault.azure.net/
- Managed Identity do Job de B não tem permissão em KV de A
- ✅ Job de B não consegue obter secrets de A

Resultado: Isolamento físico, auditável, testável
```

## Fluxo de Custo (FinOps)

```
Cada execução registra:
├── execution_id (unique)
├── tenant_id (qual cliente)
├── client_id (qual empresa)
├── tempo_execucao_segundos
├── custo_estimado (baseado em tamanho da coleta)
├── custo_real (após conclusão)
└── tags_finops (JSON)
    ├── gb_analisado
    ├── sites_visitados
    ├── documentos_processados
    └── tempo_por_site_ms

Dashboard exibe:
- Custo total por cliente (mês/ano)
- Custo por execução
- Custo por GB
- Tendência (está aumentando/diminuindo?)
- Alerta: "Execução acima do orçamento esperado"
```

## Roadmap de Implementação

### Fase 1: MVP — Control Plane + Onboarding Manual
- [x] Schema SQL
- [x] API Express (CRUD clients, tenants)
- [x] Autenticação Entra ID (fluxo corporativo)
- [ ] Frontend React básica
- [ ] Provisionamento manual de tenant (script PowerShell)
- [ ] Disparar job manualmente (CLI)

**Entrega:** Painel funcional onde SuperAdmin pode gerenciar clientes/tenants

### Fase 2: SSO Real + Execução Containerizada
- [ ] Fluxo de onboarding automático (OAuth2 multi-tenant)
- [ ] Container do job funcional
- [ ] Orquestrador (fila + dispatcher)
- [ ] Frontend dispara execução via API
- [ ] Dashboard mostra progresso em tempo real

**Entrega:** Usuário clica botão, job roda em container, resultado aparece no painel

### Fase 3: FinOps + Alertas
- [ ] Cálculo de custo por execução
- [ ] Dashboard de FinOps
- [ ] Showback mensal por cliente
- [ ] Alerta de orçamento

**Entrega:** Empresa vê quanto cada cliente custou; cliente vê relatório opcional

## Detalhes Técnicos

### Managed Identity (Azure)

**Por quê?** Eliminar secrets de variáveis de ambiente, arquivos, etc.

**Como funciona:**
1. App Service tem identidade no Entra ID
2. Atribuir RBAC: "Leitura de secrets no Key Vault X"
3. `await keyVaultClient.getSecret('client-secret')` — funciona sem passar credencial

```bash
# Configurar
APP_ID=$(az webapp show --name ct-api --resource-group ct-rg --query identity.principalId)
az keyvault set-policy --name ct-kv --object-id $APP_ID --secret-permissions get list
```

### Resilência

**Job timeout:** Se um job rodar > X horas, é cancelado
**Retry:** Se falhar, enfileira novamente (até 3 tentativas)
**Fallback:** Se Container Apps indisponível, queue persiste no banco

### Audit Log

**Toda ação registra:**
```sql
INSERT audit_log
VALUES (
  user_id = (quem fez?),
  acao = 'create_execution',
  alvo_tipo = 'execution',
  alvo_id = execution_id,
  detalhes_json = { ... },
  endereco_ip = '1.2.3.4',
  user_agent = 'Mozilla/5.0...',
  quando = GETUTCDATE()
)
```

**Queries de conformidade:**
- "Quem acessou dados do Cliente X em 2024?"
- "Qual job falhou e por quê?"
- "Alteração de credenciais — quem e quando?"

## Próximos Passos

1. Testar deployment em Azure (DEV)
2. Implementar frontend React
3. Containerizar job PowerShell
4. Setup CI/CD (GitHub Actions)
5. Testes de load (quantos clientes simultâneos?)

---

**Ver também:**
- `DEPLOYMENT.md` — Como fazer deploy
- `README.md` — Quick start
- Código fonte — `/control-plane` e `/data-plane-job`
