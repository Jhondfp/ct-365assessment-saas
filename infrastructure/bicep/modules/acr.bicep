param location string
param environment string
param projectName string

resource acr 'Microsoft.ContainerRegistry/registries@2021-12-01-preview' = {
  name: '${replace(projectName, '-', '')}acr${environment}'
  location: location
  sku: {
    name: environment == 'prod' ? 'Premium' : 'Standard'
  }
  properties: {
    adminUserEnabled: false
    publicNetworkAccess: 'Enabled'
  }
}

output loginServer string = acr.properties.loginServer
output name string = acr.name
output id string = acr.id
