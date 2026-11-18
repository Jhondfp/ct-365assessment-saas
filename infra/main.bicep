// ============================================================================
// CT Assessment 365 SaaS — infraestrutura Azure
//   - Azure SQL: banco do portal (control plane) + elastic pool com 1 banco por cliente
//   - Key Vault (access policies): credenciais do Microsoft 365 de cada cliente
//   - Container Registry: imagens do portal e do worker
//   - Container Apps: portal (Next.js) + worker de coleta (coletor PowerShell/PnP, fila do portal)
//   - Log Analytics: logs do portal e das coletas
// Não cria nenhuma atribuição de papel (RBAC): basta Contributor no resource group.
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
@description('Imagem do worker de coleta (ACR)')
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

@secure()
@description('Token compartilhado entre portal e workers para pegar coletas da fila (openssl rand -base64 33)')
param workerToken string
@secure()
@description('Senha do usuário queue_reader (só leitura da fila) no banco do portal, usado pela regra de escala do coletor')
param queueSqlPassword string
@description('Máximo de containers do coletor ao mesmo tempo (coletas + lotes de todas as coletas). Cada um: 2 vCPU / 4 GiB')
@minValue(1)
@maxValue(50)
param maxCollectors int = 10
@description('Object IDs (Entra) de quem opera o ambiente: leem e gravam os segredos do deploy (deploy-*) no Key Vault')
param operatorObjectIds array = []
@description('Tempo máximo de um container do coletor (s). Passou disso, o trabalho volta para a fila e é retomado')
param collectorTimeoutSeconds int = 86400

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
  collector: '${prefix}-coletor'
  idPortal: '${prefix}-id-portal'
}

// ───────────── Observabilidade ─────────────
resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: names.logs
  location: location
  properties: { sku: { name: 'PerGB2018' }, retentionInDays: 30 }
}

// ───────────── Identidade do portal (só para o Key Vault) ─────────────
resource idPortal 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: names.idPortal
  location: location
}

// ───────────── Registro de imagens (usuário admin: dispensa o papel AcrPull) ─────────────
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: names.acr
  location: location
  sku: { name: 'Basic' }
  properties: { adminUserEnabled: true }
}

// ───────────── Key Vault (credenciais M365 dos clientes) ─────────────
// Access policies em vez de RBAC: Contributor no resource group consegue configurar.
resource kv 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: names.kv
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: false
    enableSoftDelete: true
    softDeleteRetentionInDays: 30
    enablePurgeProtection: true
    accessPolicies: concat([
      {
        tenantId: subscription().tenantId
        objectId: idPortal.properties.principalId
        permissions: { secrets: ['get', 'list', 'set', 'delete', 'recover'] }
      }
    ], map(operatorObjectIds, id => {
      tenantId: subscription().tenantId
      objectId: id
      permissions: { secrets: ['get', 'list', 'set'] }
    }))
  }
}

// Registro de acesso ao cofre (quem leu ou gravou cada segredo)
resource kvDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'auditoria'
  scope: kv
  properties: { workspaceId: logs.id, logs: [{ category: 'AuditEvent', enabled: true }] }
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
// Auditoria do SQL (logins, consultas, alterações) no Log Analytics: quem acessou os bancos dos clientes e quando.
resource sqlMaster 'Microsoft.Sql/servers/databases@2023-08-01-preview' existing = {
  parent: sql
  name: 'master'
}
resource sqlAuditDiag 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'auditoria'
  scope: sqlMaster
  properties: { workspaceId: logs.id, logs: [{ category: 'SQLSecurityAuditEvents', enabled: true }] }
}
resource sqlAudit 'Microsoft.Sql/servers/auditingSettings@2023-08-01-preview' = {
  parent: sql
  name: 'default'
  dependsOn: [sqlAuditDiag]
  properties: { state: 'Enabled', isAzureMonitorTargetEnabled: true }
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
// Conexão ADO.NET ao banco do portal só para a regra de escala do coletor (KEDA mssql) contar a fila: usuário
// queue_reader, que só lê dbo.Assessment e dbo.AssessmentTask (criado pelo portal ao iniciar)
var queueSqlConn = 'Server=tcp:${sqlFqdn},1433;Database=${names.portalDb};User ID=queue_reader;Password=${queueSqlPassword};Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
var databaseUrl = 'sqlserver://${sqlFqdn}:1433;database=${names.portalDb};user=${sqlAdminLogin};password={${sqlAdminPassword}};encrypt=true;trustServerCertificate=false;hostNameInCertificate=*.database.windows.net;loginTimeout=30'
var useAcrPortal = startsWith(portalImage, acr.properties.loginServer)
var useAcrJob = startsWith(jobImage, acr.properties.loginServer)
var acrSecret = [{ name: 'acr-password', value: acr.listCredentials().passwords[0].value }]
var acrRegistry = [{ server: acr.properties.loginServer, username: acr.listCredentials().username, passwordSecretRef: 'acr-password' }]

// Coletor: Container Apps Job disparado pela fila (sem worker sempre ligado). A cada 30 s o KEDA conta, no banco do
// portal, só o trabalho que ESPERA container (coletas novas ou paradas há 10 min, lotes na fila respeitando o teto de
// cada coleta) e dispara uma execução para cada um (o Container Apps não desconta as execuções que já estão rodando); cada execução do job pega UM trabalho (Start-Worker.ps1 -Once), roda
// e termina. Publicar uma versão nova não interrompe execuções em andamento. Nenhum segredo de cliente fica aqui.
var queueQuery = 'SELECT (SELECT COUNT(*) FROM dbo.Assessment a WHERE a.runner = \'queue\' AND ((a.status IN (\'STARTING\', \'RUNNING\') AND ISNULL(a.heartbeatAt, a.createdAt) < DATEADD(MINUTE, -10, SYSUTCDATETIME())) OR (a.status = \'QUEUED\' AND NOT EXISTS (SELECT 1 FROM dbo.Assessment b WHERE b.clientId = a.clientId AND b.id <> a.id AND b.status IN (\'STARTING\', \'RUNNING\'))))) + ISNULL((SELECT SUM(CASE WHEN x.pend < x.free THEN x.pend ELSE x.free END) FROM (SELECT SUM(CASE WHEN t.status = \'QUEUED\' OR (t.status = \'FAILED\' AND t.attempts < 3) OR (t.status = \'RUNNING\' AND t.heartbeatAt < DATEADD(MINUTE, -10, SYSUTCDATETIME())) THEN 1 ELSE 0 END) AS pend, CASE WHEN MAX(ISNULL(TRY_CAST(JSON_VALUE(a.params, \'$.files_containers\') AS INT), 4)) - 1 - SUM(CASE WHEN t.status = \'RUNNING\' AND t.heartbeatAt >= DATEADD(MINUTE, -10, SYSUTCDATETIME()) AND ISNULL(t.runnerRef, \'\') <> \'main\' THEN 1 ELSE 0 END) > 0 THEN MAX(ISNULL(TRY_CAST(JSON_VALUE(a.params, \'$.files_containers\') AS INT), 4)) - 1 - SUM(CASE WHEN t.status = \'RUNNING\' AND t.heartbeatAt >= DATEADD(MINUTE, -10, SYSUTCDATETIME()) AND ISNULL(t.runnerRef, \'\') <> \'main\' THEN 1 ELSE 0 END) ELSE 0 END AS free FROM dbo.AssessmentTask t JOIN dbo.Assessment a ON a.id = t.assessmentId WHERE a.status = \'RUNNING\' GROUP BY t.assessmentId) x), 0)'

resource collector 'Microsoft.App/jobs@2024-03-01' = {
  name: names.collector
  location: location
  properties: {
    environmentId: env.id
    configuration: {
      triggerType: 'Event'
      replicaTimeout: collectorTimeoutSeconds
      // falha ou queda do container: o portal devolve o trabalho à fila (10 min sem sinal) e outra execução retoma
      replicaRetryLimit: 0
      eventTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
        scale: {
          minExecutions: 0
          maxExecutions: maxCollectors
          pollingInterval: 30
          rules: [
            {
              name: 'fila-de-coletas'
              type: 'mssql'
              metadata: { query: queueQuery, targetValue: '1' }
              auth: [{ secretRef: 'queue-sql', triggerParameter: 'connectionString' }]
            }
          ]
        }
      }
      registries: useAcrJob ? acrRegistry : []
      secrets: concat([{ name: 'worker-token', value: workerToken }, { name: 'queue-sql', value: queueSqlConn }], useAcrJob ? acrSecret : [])
    }
    template: {
      containers: [
        {
          name: 'collector'
          image: jobImage
          command: useAcrJob ? ['pwsh', '-NoLogo', '-NoProfile', '-NonInteractive', '-File', '/app/Start-Worker.ps1'] : []
          resources: { cpu: json('2.0'), memory: '4Gi' }
          env: [
            { name: 'PORTAL_URL', value: portalUrl }
            { name: 'WORKER_ONCE', value: '1' }
            { name: 'WORKER_TOKEN', secretRef: 'worker-token' }
            { name: 'POWERSHELL_TELEMETRY_OPTOUT', value: '1' }
          ]
        }
      ]
    }
  }
}


var entraEnabled = !empty(entraClientId) && !empty(entraClientSecret)
var baseSecrets = [
  { name: 'database-url', value: databaseUrl }
  { name: 'tenant-sql-password', value: sqlAdminPassword }
  { name: 'auth-secret', value: authSecret }
  { name: 'job-signing-secret', value: jobSigningSecret }
  { name: 'worker-token', value: workerToken }
  { name: 'queue-sql-password', value: queueSqlPassword }
]
var entraSecrets = entraEnabled ? [{ name: 'entra-secret', value: entraClientSecret }] : []
var bootstrapSecrets = empty(bootstrapAdminPassword) ? [] : [{ name: 'bootstrap-admin-password', value: bootstrapAdminPassword }]

var baseEnv = [
  { name: 'DATABASE_URL', secretRef: 'database-url' }
  { name: 'AUTH_SECRET', secretRef: 'auth-secret' }
  { name: 'AUTH_URL', value: portalUrl }
  { name: 'AUTH_LOCAL_LOGIN', value: localLogin ? 'true' : 'false' }
  { name: 'INTERNAL_EMAIL_DOMAINS', value: internalEmailDomains }
  { name: 'ADMIN_EMAILS', value: adminEmails }
  { name: 'AZURE_CLIENT_ID', value: idPortal.properties.clientId }
  { name: 'KEY_VAULT_URI', value: kv.properties.vaultUri }
  { name: 'SECRET_STORE', value: 'keyvault' }
  { name: 'TENANT_SQL_SERVER', value: sqlFqdn }
  { name: 'TENANT_SQL_USER', value: sqlAdminLogin }
  { name: 'TENANT_SQL_PASSWORD', secretRef: 'tenant-sql-password' }
  { name: 'TENANT_SQL_ELASTIC_POOL', value: names.pool }
  { name: 'JOB_RUNNER', value: 'queue' }
  { name: 'JOB_SIGNING_SECRET', secretRef: 'job-signing-secret' }
  { name: 'WORKER_TOKEN', secretRef: 'worker-token' }
  { name: 'QUEUE_SQL_PASSWORD', secretRef: 'queue-sql-password' }
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
  dependsOn: [portalDb, pool, sqlAzure]
  properties: {
    environmentId: env.id
    configuration: {
      ingress: { external: true, targetPort: useAcrPortal ? 3000 : 80, transport: 'auto', allowInsecure: false }
      registries: useAcrPortal ? acrRegistry : []
      secrets: concat(baseSecrets, entraSecrets, bootstrapSecrets, useAcrPortal ? acrSecret : [])
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
      // os pools de conexão por banco de cliente ficam em memória: 1 réplica basta para começar
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

output portalUrl string = portalUrl
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output keyVaultUri string = kv.properties.vaultUri
output sqlServer string = sqlFqdn
output collectorJobName string = collector.name
output entraRedirectUri string = '${portalUrl}/api/auth/callback/microsoft-entra-id'
