# Deployment Guide — CT Assessment SaaS Multi-Tenant

## Pré-requisitos

- Azure CLI instalado (`az cli`)
- Bicep CLI (vem com Azure CLI 2.3+)
- PowerShell 7+ (para scripts)
- Node.js 18+
- Docker (para desenvolvimento local)

## Variáveis de Ambiente Obrigatórias

Crie um arquivo `.env` na raiz do projeto com:

```bash
# Azure Identity
AZURE_TENANT_ID=<seu-tenant-id>
AZURE_CLIENT_ID=<app-registration-id>
AZURE_CLIENT_SECRET=<client-secret>
AZURE_SUBSCRIPTION_ID=<subscription-id>

# Database (será criado automaticamente pela IaC)
CP_DB_SERVER=ct-assessment-cp-prod.database.windows.net
CP_DB_NAME=ct_control_plane
CP_DB_USER=ctadmin
CP_DB_PASSWORD=<senha-forte>

# Entra ID (multi-tenant para onboarding)
CUSTOMER_APP_REGISTRATION_ID=<customer-app-id>
CUSTOMER_APP_REGISTRATION_SECRET=<customer-app-secret>

# Keys
JWT_SECRET=<jwt-secret-64-chars>
SESSION_SECRET=<session-secret-64-chars>

# App URLs
APP_URL=https://ct-assessment-cp-prod.azurewebsites.net
FRONTEND_URL=https://ct-assessment-portal.azurewebsites.net
```

## Fase 1: Deploy da Infraestrutura (IaC — Bicep)

### 1.1 Validar Bicep

```bash
az bicep build-params --file infrastructure/bicep/main.bicepparams
```

### 1.2 Deploy via Bicep

```bash
# Dev environment
az deployment sub create \
  --name ct-assessment-dev \
  --location brazilsouth \
  --template-file infrastructure/bicep/main.bicep \
  --parameters location=brazilsouth environment=dev projectName=ct-assessment

# Prod environment
az deployment sub create \
  --name ct-assessment-prod \
  --location brazilsouth \
  --template-file infrastructure/bicep/main.bicep \
  --parameters location=brazilsouth environment=prod projectName=ct-assessment
```

### 1.3 Capturar Outputs

```bash
# Salvará os nomes de recursos criados
az deployment sub show \
  --name ct-assessment-prod \
  --query properties.outputs
```

## Fase 2: Preparar Control Plane

### 2.1 Executar Migrations SQL

```bash
# Conectar ao SQL Server
sqlcmd -S ct-assessment-cp-prod.database.windows.net -U ctadmin -P '<senha>' -d ct_control_plane

# Executar migration
:r control-plane/migrations/001-initial-schema.sql
GO
```

Ou via Node.js (se script de migration estiver pronto):

```bash
cd control-plane/backend
npm run migrate
```

### 2.2 Configurar Managed Identity

O App Service foi criado com Managed Identity ativada. Atribuir permissões:

```bash
# Obter object ID do App Service
APP_SERVICE_ID=$(az webapp show \
  --name ct-assessment-cp-prod \
  --resource-group ct-assessment-prod-rg \
  --query identity.principalId -o tsv)

# Atribuir permissão de leitura no Key Vault
az keyvault set-policy \
  --name ct-cp-kv-prod \
  --object-id $APP_SERVICE_ID \
  --secret-permissions get list
```

## Fase 3: Build e Deploy da Aplicação

### 3.1 Build Docker da API

```bash
cd control-plane/backend

# Build
docker build -t ct-assessment-api:latest .

# Tag para ACR
docker tag ct-assessment-api:latest \
  ctacr.azurecr.io/ct-assessment-api:latest

# Push para ACR
az acr login --name ctacr
docker push ctacr.azurecr.io/ct-assessment-api:latest
```

### 3.2 Deploy no App Service

```bash
# Via CLI
az webapp create \
  --name ct-assessment-cp-prod \
  --resource-group ct-assessment-prod-rg \
  --plan ct-assessment-cp-plan-prod \
  --deployment-container-image-name ctacr.azurecr.io/ct-assessment-api:latest

# Ou via ARM template (mais completo)
```

## Desenvolvimento Local

### 1. Clonar repositório

```bash
git clone <repo-url>
cd ct-365assessment-saas
```

### 2. Copiar .env

```bash
cp .env.example .env
# Editar com seus valores Azure
```

### 3. Subir containers

```bash
docker-compose up -d

# Verificar status
docker-compose ps

# Logs
docker-compose logs -f api
```

### 4. Acessar

- **API**: http://localhost:3001/api
- **Frontend**: http://localhost:3000
- **SQL Server**: localhost:1433 (user: sa, password: @Secure!Pass123456)

### 5. Encerrar

```bash
docker-compose down

# Remover volumes (apaga dados)
docker-compose down -v
```

## Troubleshooting

### SQL Connection Timeout

```bash
# Verificar firewall do SQL
az sql server firewall-rule list \
  --server ct-assessment-cp-prod \
  --resource-group ct-assessment-prod-rg
```

### App Service não inicia

```bash
# Ver logs
az webapp log stream \
  --name ct-assessment-cp-prod \
  --resource-group ct-assessment-prod-rg
```

### Managed Identity não funciona

```bash
# Verificar se policy foi aplicada
az keyvault show-deleted \
  --name ct-cp-kv-prod \
  --resource-group ct-assessment-prod-rg
```

## Próximas Etapas

1. **Fase 2**: Implementar containerização da execução PowerShell
2. **Fase 3**: Implementar self-service onboarding (OAuth2 multi-tenant)
3. **Fase 4**: Dashboard de FinOps e showback
4. **Fase 5**: Portal do cliente (viewer-only)

---

Ver também: `docs/architecture.md`
