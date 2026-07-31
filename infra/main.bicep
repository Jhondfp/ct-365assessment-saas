// ============================================================================
// CT Assessment SaaS - Azure Infrastructure as Code (Bicep)
// Deployment para: rg-365gov-prod
// Localização: Brazil South
// ============================================================================

targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
param environment string = 'prod'

@description('Location for resources')
param location string = resourceGroup().location

@description('Unique identifier for resource naming')
param uniqueSuffix string = uniqueString(resourceGroup().id).substring(0, 6)

@description('PostgreSQL Admin Username')
param pgAdminUsername string = 'ctadmin'

@description('PostgreSQL Admin Password')
@secure()
param pgAdminPassword string

@description('App Service Plan SKU')
param appServiceSku string = 'B2'

// ============================================================================
// Variables
// ============================================================================

var projectName = 'ct-assessment'
var commonTags = {
  environment: environment
  project: projectName
  createdBy: 'bicep'
  createdDate: utcNow('u')
}

// Naming conventions
var pgServerName = '${projectName}-pg-${environment}-${uniqueSuffix}'
var appServiceName = '${projectName}-api-${environment}-${uniqueSuffix}'
var appServicePlanName = '${projectName}-plan-${environment}'
var storageAccountName = replace('${projectName}${environment}${uniqueSuffix}', '-', '')
var keyVaultName = '${projectName}-kv-${environment}-${uniqueSuffix}'
var containerRegistryName = replace('${projectName}${environment}${uniqueSuffix}', '-', '')
var appInsightsName = '${projectName}-insights-${environment}-${uniqueSuffix}'
var staticWebAppName = '${projectName}-web-${environment}-${uniqueSuffix}'

// ============================================================================
// 1. POSTGRESQL - Control Plane Database
// ============================================================================

resource pgServer 'Microsoft.DBforPostgreSQL/flexibleServers@2023-12-01-preview' = {
  name: pgServerName
  location: location
  tags: commonTags
  sku: {
    name: 'Standard_B2s'
    tier: 'Burstable'
  }
  properties: {
    administratorLogin: pgAdminUsername
    administratorLoginPassword: pgAdminPassword
    createMode: 'Default'
    version: '15'
    backup: {
      backupRetentionDays: 7
      geoRedundantBackup: 'Disabled'
    }
    network: {
      delegatedSubnetResourceId: ''
      publicNetworkAccess: 'Enabled'
    }
    highAvailability: {
      mode: 'Disabled'
    }
    storage: {
      storageSizeGB: 32
    }
    replicationRole: 'Primary'
  }
}

// PostgreSQL Firewall Rule - Allow Azure Services
resource pgFirewallAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2023-12-01-preview' = {
  parent: pgServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// PostgreSQL Database - Control Plane
resource pgControlPlaneDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-12-01-preview' = {
  parent: pgServer
  name: 'ct_assessment_control_plane'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

// ============================================================================
// 2. KEY VAULT - Secrets Management
// ============================================================================

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: commonTags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    accessPolicies: []
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enablePurgeProtection: false
    enableRbacAuthorization: true
  }
}

// Key Vault Secrets
resource kvSecretPgPassword 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'CP-DB-PASSWORD'
  properties: {
    value: pgAdminPassword
  }
}

resource kvSecretJwtSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'JWT-SECRET'
  properties: {
    value: uniqueString(resourceGroup().id, 'jwt', utcNow())
  }
}

resource kvSecretSessionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'SESSION-SECRET'
  properties: {
    value: uniqueString(resourceGroup().id, 'session', utcNow())
  }
}

// ============================================================================
// 3. STORAGE ACCOUNT - PDF Reports & Blobs
// ============================================================================

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: commonTags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

// Blob Container for PDF Reports
resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  name: '${storageAccount.name}/default/pdf-reports'
  properties: {
    publicAccess: 'None'
  }
}

// ============================================================================
// 4. CONTAINER REGISTRY - Docker Images
// ============================================================================

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: containerRegistryName
  location: location
  tags: commonTags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
}

// ============================================================================
// 5. APP SERVICE PLAN & APP SERVICE - Backend API
// ============================================================================

resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: commonTags
  sku: {
    name: appServiceSku
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appServiceName
  location: location
  tags: commonTags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    virtualNetworkSubnetId: ''
  }

  resource config 'config' = {
    name: 'web'
    properties: {
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      http20Enabled: true
      minTlsVersion: '1.2'
      scmMinTlsVersion: '1.2'
    }
  }

  resource appSettings 'config' = {
    name: 'appsettings'
    properties: {
      NODE_ENV: environment
      LOG_LEVEL: environment == 'prod' ? 'info' : 'debug'
      PORT: '8080'

      // Database
      CP_DB_SERVER: pgServer.properties.fullyQualifiedDomainName
      CP_DB_PORT: '5432'
      CP_DB_NAME: 'ct_assessment_control_plane'
      CP_DB_USER: pgAdminUsername
      'CP_DB_PASSWORD@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/CP-DB-PASSWORD/)': ''

      // Azure
      AZURE_TENANT_ID: subscription().tenantId
      AZURE_SUBSCRIPTION_ID: subscription().subscriptionId
      KEYVAULT_URL: keyVault.properties.vaultUri
      AZURE_STORAGE_CONNECTION_STRING: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${listKeys(storageAccount.id, '2023-01-01').keys[0].value};EndpointSuffix=core.windows.net'
      ACR_LOGIN_SERVER: containerRegistry.properties.loginServer

      // CORS
      CORS_ORIGINS: 'https://${staticWebAppName}.azurestaticapps.net'

      // Logging
      APPINSIGHTS_CONNECTION_STRING: appInsights.properties.ConnectionString

      // Secrets (reference to Key Vault)
      'JWT_SECRET@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/JWT-SECRET/)': ''
      'SESSION_SECRET@Microsoft.KeyVault(SecretUri=${keyVault.properties.vaultUri}secrets/SESSION-SECRET/)': ''
    }
  }
}

// ============================================================================
// 6. APPLICATION INSIGHTS - Monitoring
// ============================================================================

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: commonTags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    RetentionInDays: 30
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

// Link App Service to Application Insights
resource appInsightsExtension 'Microsoft.Web/sites/siteextensions@2023-01-01' = {
  parent: appService
  name: 'Microsoft.ApplicationInsights.Extension'
}

// ============================================================================
// 7. STATIC WEB APP - Frontend React
// ============================================================================

resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: commonTags
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    buildProperties: {
      appLocation: '/'
      apiLocation: 'api'
      outputLocation: 'dist'
      appArtifactLocation: 'dist'
    }
    enterpriseGradeCdnStatus: 'Disabled'
  }
}

// Static Web App Configuration
resource staticWebAppConfig 'Microsoft.Web/staticSites/config@2023-01-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    apiLocation: 'api'
    outputLocation: 'dist'
    appLocation: '/'
  }
}

// ============================================================================
// 8. ROLE ASSIGNMENTS - Managed Identity Permissions
// ============================================================================

// App Service - Access to Key Vault (Secrets Reader)
resource keyVaultSecretsReaderRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: keyVault
  name: guid(keyVault.id, appService.identity.principalId, 'Key Vault Secrets User')
  properties: {
    roleDefinitionId: '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/4633458b-17de-408a-b874-0445c86db48f'
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// App Service - Access to Storage Account
resource storageContributorRole 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: storageAccount
  name: guid(storageAccount.id, appService.identity.principalId, 'Storage Blob Data Contributor')
  properties: {
    roleDefinitionId: '/subscriptions/${subscription().subscriptionId}/providers/Microsoft.Authorization/roleDefinitions/ba92f5b4-2d11-453d-a403-e96b0029c9fe'
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// ============================================================================
// OUTPUTS
// ============================================================================

@description('PostgreSQL Server FQDN')
output pgServerFqdn string = pgServer.properties.fullyQualifiedDomainName

@description('PostgreSQL Connection String (Control Plane)')
output pgConnectionString string = 'postgresql://${pgAdminUsername}@${pgServer.properties.fullyQualifiedDomainName}:5432/ct_assessment_control_plane'

@description('App Service URL')
output appServiceUrl string = 'https://${appService.properties.defaultHostName}'

@description('Static Web App URL')
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'

@description('Key Vault URL')
output keyVaultUrl string = keyVault.properties.vaultUri

@description('Storage Account Name')
output storageAccountName string = storageAccount.name

@description('Container Registry Login Server')
output containerRegistryServer string = containerRegistry.properties.loginServer

@description('Application Insights Instrumentation Key')
output appInsightsKey string = appInsights.properties.InstrumentationKey
