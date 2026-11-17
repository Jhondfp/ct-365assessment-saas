// ============================================================================
// CT Assessment 365 SaaS — infraestrutura Azure
//   - Azure SQL: banco do portal (control plane) + elastic pool com 1 banco por cliente
//   - Key Vault (RBAC): credenciais do Microsoft 365 de cada cliente
//   - Container Registry: imagens do portal e do job
//   - Container Apps: portal (Next.js) + Container Apps Job manual (coletor PowerShell/PnP)
//   - Log Analytics: logs do portal e de cada execução do job
// Implantação: infra/deploy.sh (ver README.md → Implantação no Azure)
// ============================================================================
targetScope = 'resourceGroup'

@description('Prefixo dos recursos (minúsculas, sem espaços)')
@minLength(3)
@maxLength(12)
param prefix string = 'ctassess'
param location string = resourceGroup().location

@description('Login administrador do Azure SQL (usado pelo portal e pelos jobs nos bancos dos clientes)')
param sqlAdminLogin string = 'ctadmin'
@secure()
param sqlAdminPassword string

@description('Elastic pool dos bancos de clientes (DTU). Ex.: StandardPool/Standard 50, 100…')
param poolSkuName string = 'StandardPool'
param poolTier string = 'Standard'
param poolDtu int = 50

@description('Imagem do portal (ACR). Na primeira implantação, deixe o placeholder; o deploy.sh atualiza.')
param portalImage string = 'mcr.microsoft.com/k8se/quickstart:latest'
@description('Imagem do job de coleta (ACR)')
param jobImage string = 'mcr.microsoft.com/k8se/quickstart-jobs:latest'

@secure()
@description('AUTH_SECRET do Auth.js (openssl rand -base64 33)')
param authSecret string
@secure()
@description('Segredo para assinar os tokens dos jobs (openssl rand -base64 33)')
param jobSigningSecret string

@description('Entra ID multi-tenant (login Microsoft 365). Vazio = só login local.')
param entraClientId string = ''
@secure()
param entraClientSecret string = ''
@description('Domínios da equipe Cloud Target (entram e aguardam papel)')
param internalEmailDomains string = 'cloudtarget.com.br'
@description('E-mails que entram como Administrador no primeiro login')
param adminEmails string = ''
@description('Administrador inicial com login local (opcional)')
param bootstrapAdminEmail string = ''
@secure()
param bootstrapAdminPassword string = ''
@description('Habilita o login local (e-mail + senha)')
param localLogin bool = true
@description('Domínio próprio do portal (opcional). Vazio = FQDN do Container Apps.')
param customUrl string = ''

@description('Tempo máximo de uma execução do coletor (segundos). Em caso de queda, o retry retoma de onde parou.')
param jobTimeoutSeconds int = 43200
param jobRetryLimit int = 3

var suffix = uniqueString(resourceGroup().id)
var names = {
  logs: '${prefix}-logs'
  acr: toLower(replace('${prefix}acr${suffix}', '-', ''))
  kv: take('${prefix}-kv-${suffix}', 24)
  sql: '${prefix}-sql-${suffix}'
  pool: '${prefix}-pool'
  portalDb: 'ctassessment_portal'
  env: '${prefix}-env'
  portal: '${prefix}-portal'
  job: '${prefix}-job'
  idPortal: '${prefix}-id-portal'
  idJob: '${prefix}-id-job'
}

var roles = {
  acrPull: '7f951dda-4ed3-4680-a7ca-43fe172d538d'
  kvSecretsOfficer: 'b86a8fe4-44ce-4948-aee5-eccb2c155cd7'
  jobsOperator: 'b9a307c4-5aa3-4b52-ba60-2b17c136cd7b'
}

// ───────────── Observabilidade ─────────────
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

// ───────────── Identidades ─────────────
resource idPortal 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.idPortal
  location: location
}
resource idJob 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.idJob
  location: location
}

// ───────────── Registro de imagens ─────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: names.acr
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: false }
}
resource acrPullPortal 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, idPortal.id, roles.acrPull)
  properties: { roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull), principalId: idPortal.properties.principalId, principalType: 'ServicePrincipal' }
}
resource acrPullJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: acr
  name: guid(acr.id, idJob.id, roles.acrPull)
  properties: { roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.acrPull), principalId: idJob.properties.principalId, principalType: 'ServicePrincipal' }
}

// ───────────── Key Vault (credenciais M365 dos clientes) ─────────────
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: names.kv
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
  }
}
resource kvPortal 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: kv
  name: guid(kv.id, idPortal.id, roles.kvSecretsOfficer)
  properties: { roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.kvSecretsOfficer), principalId: idPortal.properties.principalId, principalType: 'ServicePrincipal' }
}

// ───────────── Azure SQL ─────────────
resource sql 'Microsoft.Sql/servers@2023-08-01-preview' = {
  name: names.sql
  location: location
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}
// Container Apps (consumo) sai por IPs do Azure: libera serviços do Azure.
resource sqlAzure 'Microsoft.Sql/servers/firewallRules@2023-08-01-preview' = {
  parent: sql
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}
resource portalDb 'Microsoft.Sql/servers/databases@2023-08-01-preview' = {
  parent: sql
  name: names.portalDb
  location: location
  sku: { name: 'S0', tier: 'Standard' }
}
resource pool 'Microsoft.Sql/servers/elasticPools@2023-08-01-preview' = {
  parent: sql
  name: names.pool
  location: location
  sku: { name: poolSkuName, tier: poolTier, capacity: poolDtu }
  properties: { perDatabaseSettings: { minCapacity: 0, maxCapacity: poolDtu } }
}

// ───────────── Container Apps ─────────────
resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: names.env
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: { customerId: logs.properties.customerId, sharedKey: logs.listKeys().primarySharedKey }
    }
  }
}

var portalUrl = empty(customUrl) ? 'https://${names.portal}.${env.properties.defaultDomain}' : customUrl
var sqlFqdn = sql.properties.fullyQualifiedDomainName
// Senha com ; = { } precisa ir entre chaves na connection string do Prisma
var databaseUrl = 'sqlserver://${sqlFqdn}:1433;database=${names.portalDb};user=${sqlAdminLogin};password={${sqlAdminPassword}};encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=30'
var useAcrPortal = startsWith(portalImage, acr.properties.loginServer)
var useAcrJob = startsWith(jobImage, acr.properties.loginServer)

resource job 'Microsoft.App/jobs@2024-03-01' = {
  name: names.job
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${idJob.id}': {} } }
  dependsOn: [acrPullJob]
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: jobTimeoutSeconds
      replicaRetryLimit: jobRetryLimit
      manualTriggerConfig: { parallelism: 1, replicaCompletionCount: 1 }
      registries: useAcrJob ? [{ server: acr.properties.loginServer, identity: idJob.id }] : []
    }
    template: {
      containers: [
        {
          name: 'collector'
          image: jobImage
          resources: { cpu: json('2.0'), memory: '4Gi' }
          // ASSESSMENT_ID, CALLBACK_URL e CALLBACK_TOKEN entram por execução (o portal sobrescreve ao iniciar).
          // Nenhum segredo fica no job: a configuração vem do portal, autenticada pelo token da execução.
          env: [{ name: 'POWERSHELL_TELEMETRY_OPTOUT', value: '1' }]
        }
      ]
    }
  }
}

resource jobOperator 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: job
  name: guid(job.id, idPortal.id, roles.jobsOperator)
  properties: { roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', roles.jobsOperator), principalId: idPortal.properties.principalId, principalType: 'ServicePrincipal' }
}

var entraEnabled = !empty(entraClientId) && !empty(entraClientSecret)
var baseSecrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'tenant-sql-password', value: sqlAdminPassword }
  { name: 'auth-secret', value: authSecret }
  { name: 'job-signing-secret', value: jobSigningSecret }
]
var entraSecrets = entraEnabled ? [{ name: 'entra-secret', value: entraClientSecret }] : []
var bootstrapSecrets = empty(bootstrapAdminPassword) ? [] : [{ name: 'bootstrap-admin-password', value: bootstrapAdminPassword }]

var baseEnv = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
  { name: 'AUTH_URL', value: portalUrl }
  { name: 'AUTH_LOCAL_LOGIN', value: string(localLogin) }
  { name: 'INTERNAL_EMAIL_DOMAINS', value: internalEmailDomains }
  { name: 'ADMIN_EMAILS', value: adminEmails }
  { name: 'AZURE_CLIENT_ID', value: idPortal.properties.clientId }
  { name: 'KEY_VAULT_URI', value: kv.properties.vaultUri }
  { name: 'SECRET_STORE', value: 'keyvault' }
  { name: 'TENANT_SQL_SERVER', value: sqlFqdn }
  { name: 'TENANT_SQL_USER', value: sqlAdminLogin }
  { name: 'TENANT_SQL_PASSWORD', secretRef: 'tenant-sql-password' }
  { name: 'TENANT_SQL_ELASTIC_POOL', value: names.pool }
  { name: 'JOB_RUNNER', value: 'aca' }
  { name: 'JOB_SIGNING_SECRET', secretRef: 'job-signing-secret' }
  { name: 'ACA_SUBSCRIPTION_ID', value: subscription().subscriptionId }
  { name: 'ACA_RESOURCE_GROUP', value: resourceGroup().name }
  { name: 'ACA_JOB_NAME', value: names.job }
  { name: 'PORTAL_CALLBACK_URL', value: portalUrl }
  { name: 'JOB_IMAGE', value: jobImage }
]
var entraEnv = entraEnabled ? [
  { name: 'AUTH_MICROSOFT_ENTRA_ID_ID', value: entraClientId }
  { name: 'AUTH_MICROSOFT_ENTRA_ID_SECRET', secretRef: 'entra-secret' }
  { name: 'AUTH_MICROSOFT_ENTRA_ID_ISSUER', value: '${environment().authentication.loginEndpoint}organizations/v2.0' }
] : []
var bootstrapEnv = empty(bootstrapAdminPassword) ? [] : [
  { name: 'BOOTSTRAP_ADMIN_EMAIL', value: bootstrapAdminEmail }
  { name: 'BOOTSTRAP_ADMIN_PASSWORD', secretRef: 'bootstrap-admin-password' }
]

resource portal 'Microsoft.App/containerApps@2024-03-01' = {
  name: names.portal
  location: location
  identity: { type: 'UserAssigned', userAssignedIdentities: { '${idPortal.id}': {} } }
  dependsOn: [acrPullPortal, kvPortal, jobOperator, portalDb, pool, sqlAzure]
  properties: {
    environmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      registries: useAcrPortal ? [{ server: acr.properties.loginServer, identity: idPortal.id }] : []
      secrets: concat(baseSecrets, entraSecrets, bootstrapSecrets)
    }
    template: {
      containers: [
        {
          name: 'portal'
          image: portalImage
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: concat(baseEnv, entraEnv, bootstrapEnv)
          probes: useAcrPortal ? [
            { type: 'Liveness', httpGet: { path: '/api/health', port: 3000 }, initialDelaySeconds: 30, periodSeconds: 30, failureThreshold: 5 }
          ] : []
        }
      ]
      // o portal guarda pools de conexão por banco de cliente em memória: 1 réplica basta para começar
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

output portalUrl string = portalUrl
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output keyVaultUri string = kv.properties.vaultUri
output sqlServer string = sqlFqdn
output jobName string = job.name
output entraRedirectUri string = '${portalUrl}/api/auth/callback/microsoft-entra-id'
