# Deployment Guide - CT Assessment SaaS no Azure

## 📋 Pré-requisitos

- [x] Azure CLI instalado: `az --version`
- [x] Acesso ao Resource Group: `rg-365gov-prod`
- [x] GitHub account com acesso ao repositório
- [x] Azure subscription: `35d6dfb5-91e7-4cd4-b0e1-b771118aa3854`
- [x] Permissions: Owner ou Contributor no Resource Group

---

## 🔐 Configurar Secrets no GitHub

### 1. Gerar Azure Credentials

```bash
# Login no Azure
az login

# Criar Service Principal para CI/CD
az ad sp create-for-rbac \
  --name "ct-assessment-github-actions" \
  --role "Contributor" \
  --scopes "/subscriptions/35d6dfb5-91e7-4cd4-b0e1-b771118aa3854/resourceGroups/rg-365gov-prod"
```

**Saída esperada:**
```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "subscriptionId": "35d6dfb5-91e7-4cd4-b0e1-b771118aa3854",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

### 2. Adicionar Secrets no GitHub

Ir para: **Repository Settings → Secrets and variables → Actions**

Adicionar os seguintes secrets:

```
AZURE_CREDENTIALS
{
  "clientId": "...",
  "clientSecret": "...",
  "subscriptionId": "35d6dfb5-91e7-4cd4-b0e1-b771118aa3854",
  "tenantId": "..."
}

PG_ADMIN_PASSWORD
your-secure-postgresql-password-here

AZURE_REGISTRY_USERNAME
<msp_container_registry_username>

AZURE_REGISTRY_PASSWORD
<msp_container_registry_password>

AZURE_APP_SERVICE_PUBLISH_PROFILE
<PublishSettings profile from App Service>

AZURE_STATIC_WEB_APPS_API_TOKEN
<deployment-token from Static Web App>
```

### 3. Obter PostgreSQL Admin Password

Gere uma senha segura:
```bash
# Opção 1: Terminal
openssl rand -base64 32

# Opção 2: PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```

### 4. Obter Container Registry Credentials

```bash
az acr credential show \
  --resource-group rg-365gov-prod \
  --name ctassessment
```

### 5. Obter App Service Publish Profile

```bash
az webapp deployment list-publishing-profiles \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-* \
  --output xml
```

---

## 🚀 Primeiro Deployment

### Opção A: Via GitHub Actions (Recomendado)

```bash
# 1. Push das mudanças para main
git checkout main
git pull origin main
git push origin claude/session-jkv0ns:main

# 2. Acompanhar deployment
# Ir para: Actions → Deploy to Azure (PostgreSQL)
```

### Opção B: Manual via Azure CLI

```bash
# 1. Login
az login --use-device-code

# 2. Set subscription
az account set --subscription 35d6dfb5-91e7-4cd4-b0e1-b771118aa3854

# 3. Deploy Bicep
az deployment group create \
  --resource-group rg-365gov-prod \
  --template-file infra/main.bicep \
  --parameters \
    environment=prod \
    location=brazilsouth \
    pgAdminPassword="your-secure-password"

# 4. Obter outputs
az deployment group show \
  --resource-group rg-365gov-prod \
  --name main \
  --query 'properties.outputs' -o json
```

---

## 📝 Configurações Pós-Deploy

### 1. Configurar Conexão do PostgreSQL

```bash
# Obter FQDN
az postgres flexible-server show \
  --resource-group rg-365gov-prod \
  --name ct-assessment-pg-prod-* \
  --query fullyQualifiedDomainName

# Testar conexão
psql -U ctadmin@ct-assessment-pg-prod-* \
  -h ct-assessment-pg-prod-*.postgres.database.azure.com \
  -d ct_assessment_control_plane
```

### 2. Executar Migrations

```bash
# Via App Service
az webapp command invoke \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-* \
  --command-name npm \
  --command-args 'run migrate'

# Ou acessar SSH
az webapp create-remote-connection \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-*
```

### 3. Configurar Key Vault Access

```bash
# Dar permissão ao App Service
$appServicePrincipalId = az webapp identity show \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-* \
  --query principalId -o tsv

az keyvault set-policy \
  --name ct-assessment-kv-prod-* \
  --object-id $appServicePrincipalId \
  --secret-permissions get list
```

### 4. Validar Saúde da Aplicação

```bash
# Health check
curl https://ct-assessment-api-prod-*.azurewebsites.net/saude

# Logs em tempo real
az webapp log tail \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-*
```

---

## 🔍 Monitoramento

### Application Insights

```bash
# Obter Instrumentation Key
az monitor app-insights component show \
  --resource-group rg-365gov-prod \
  --app ct-assessment-insights-prod-* \
  --query instrumentationKey
```

Acessar: https://portal.azure.com → Application Insights → ct-assessment-insights-prod-*

### Logs

```bash
# Azure Monitor Logs
az monitor metrics list-definitions \
  --resource-group rg-365gov-prod \
  --resource-type "Microsoft.Web/sites" \
  --resource ct-assessment-api-prod-*

# App Service Logs
az webapp log config \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-* \
  --web-server-logging filesystem \
  --detailed-error-messages true

# Streaming logs
az webapp log tail \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-*
```

---

## 🛠️ Troubleshooting

### Problema: "PostgreSQL Server Not Reachable"

```bash
# Verificar firewall rules
az postgres flexible-server firewall-rule list \
  --resource-group rg-365gov-prod \
  --name ct-assessment-pg-prod-*

# Adicionar regra para App Service
az postgres flexible-server firewall-rule create \
  --resource-group rg-365gov-prod \
  --name ct-assessment-pg-prod-* \
  --rule-name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0
```

### Problema: "Key Vault Access Denied"

```bash
# Verificar políticas de acesso
az keyvault access-policy list \
  --resource-group rg-365gov-prod \
  --name ct-assessment-kv-prod-*

# Resetar política para App Service
az keyvault set-policy \
  --name ct-assessment-kv-prod-* \
  --object-id $appServicePrincipalId \
  --secret-permissions get list \
  --overwrite
```

### Problema: "Migrations Failed"

```bash
# Ver logs de erro
az webapp log tail \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-* \
  --filter "ERROR"

# Conectar via SSH e rodar manualmente
az webapp create-remote-connection \
  --resource-group rg-365gov-prod \
  --name ct-assessment-api-prod-*

# No SSH:
cd /home/site/wwwroot
npm run migrate
```

---

## 📊 Estrutura de Recursos Criados

```
rg-365gov-prod
├── PostgreSQL Server (ct-assessment-pg-prod-*)
│   └── Database: ct_assessment_control_plane
├── App Service (ct-assessment-api-prod-*)
│   └── App Service Plan (ct-assessment-plan-prod)
├── Static Web App (ct-assessment-web-prod-*)
├── Storage Account (ctassessmentprod*)
│   └── Blob Container: pdf-reports
├── Container Registry (ctassessment)
├── Key Vault (ct-assessment-kv-prod-*)
│   ├── Secret: CP-DB-PASSWORD
│   ├── Secret: JWT-SECRET
│   └── Secret: SESSION-SECRET
└── Application Insights (ct-assessment-insights-prod-*)
```

---

## 🔄 Atualizar Aplicação

```bash
# 1. Fazer mudanças no código
git checkout claude/session-jkv0ns
git add .
git commit -m "Update: feature description"

# 2. Fazer merge para main
git checkout main
git merge claude/session-jkv0ns

# 3. Push (triggers GitHub Actions)
git push origin main

# 4. Monitorar deployment
# GitHub → Actions → Deploy to Azure
```

---

## 📲 Alerts & Notifications

Configurar alertas no Application Insights:

```bash
# Criar alert para erro rates
az monitor metrics alert create \
  --resource-group rg-365gov-prod \
  --name "CT Assessment - High Error Rate" \
  --condition "avg failed_requests/total_requests > 0.05 over 5m" \
  --resource /subscriptions/35d6dfb5-91e7-4cd4-b0e1-b771118aa3854/resourceGroups/rg-365gov-prod/providers/microsoft.insights/components/ct-assessment-insights-prod-*
```

---

## 💰 Estimativa de Custos Mensais

| Serviço | SKU | Custo/mês |
|---------|-----|-----------|
| PostgreSQL | Standard B2s | ~$45 |
| App Service | B2 (Linux) | ~$15 |
| Storage Account | Standard LRS | ~$1 |
| Container Registry | Basic | ~$5 |
| Key Vault | Standard | ~$0.34 |
| Static Web App | Free | ~$0 |
| Application Insights | Basic (1GB) | ~$0.87 |
| **Total** | | **~$67/mês** |

---

## ✅ Checklist de Deployment

- [ ] PostgreSQL database criado e acessível
- [ ] Migrations executadas com sucesso
- [ ] App Service rodando sem erros
- [ ] Frontend Static Web App online
- [ ] API health check passando (/saude)
- [ ] Key Vault secrets configurados
- [ ] Application Insights recebendo telemetria
- [ ] Backups do PostgreSQL configurados
- [ ] Alerts configurados
- [ ] CORS configurado corretamente

---

## 📞 Suporte

Para problemas:

1. Verificar logs: `az webapp log tail --resource-group rg-365gov-prod --name ct-assessment-api-prod-*`
2. Verificar Azure Portal: rg-365gov-prod
3. Revisar GitHub Actions: Repository → Actions
4. Documentação PostgreSQL: https://www.postgresql.org/docs/15/

---

**Última atualização**: Julho 27, 2025
**Versão**: 1.0 (PostgreSQL Migration - Phase 1)
