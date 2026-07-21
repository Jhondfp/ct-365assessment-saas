param location string
param environment string
param projectName string

// ======================================
// SQL Server + Control Plane Database
// ======================================
resource sqlServer 'Microsoft.Sql/servers@2021-08-01-preview' = {
  name: '${projectName}-cp-${environment}'
  location: location
  properties: {
    administratorLogin: 'ctadmin'
    administratorLoginPassword: '@Secure!Pass${uniqueString(resourceGroup().id)}'
    publicNetworkAccess: 'Enabled'
    restrictOutboundNetworkAccess: 'Disabled'
  }
}

resource database 'Microsoft.Sql/servers/databases@2021-08-01-preview' = {
  name: 'ct_control_plane'
  parent: sqlServer
  location: location
  sku: {
    name: environment == 'prod' ? 'S2' : 'S0'
    tier: 'Standard'
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

// Firewall rules (permitir Azure Services)
resource firewallRule 'Microsoft.Sql/servers/firewallRules@2021-08-01-preview' = {
  name: 'AllowAzureServices'
  parent: sqlServer
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// ======================================
// App Service (Control Plane API + Frontend)
// ======================================
resource appServicePlan 'Microsoft.Web/serverfarms@2021-03-01' = {
  name: '${projectName}-cp-plan-${environment}'
  location: location
  sku: {
    name: environment == 'prod' ? 'P1V2' : 'B2'
    tier: environment == 'prod' ? 'PremiumV2' : 'Basic'
    capacity: environment == 'prod' ? 2 : 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource appService 'Microsoft.Web/sites@2021-03-01' = {
  name: '${projectName}-cp-${environment}'
  location: location
  kind: 'app,linux,container'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      alwaysOn: environment == 'prod'
      linuxFxVersion: 'NODE|18-lts'
      appSettings: [
        {
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
      ]
    }
  }
}

// ======================================
// Outputs
// ======================================
output sqlServerName string = sqlServer.name
output databaseName string = database.name
output appServiceUrl string = appService.properties.defaultHostName
output appServiceIdentity string = appService.identity.principalId
