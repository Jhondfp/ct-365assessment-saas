// Main Bicep file for CT Assessment SaaS Multi-Tenant Infrastructure

targetScope = 'subscription'

param location string = 'brazilsouth'
param environment string = 'prod' // dev, staging, prod
param projectName string = 'ct-assessment'

// ======================================
// Resource Group
// ======================================
resource rg 'Microsoft.Resources/resourceGroups@2021-04-01' = {
  name: '${projectName}-${environment}-rg'
  location: location
}

// ======================================
// Control Plane (centralizado)
// ======================================
module controlPlane './modules/control-plane.bicep' = {
  scope: rg
  name: 'controlPlane'
  params: {
    location: location
    environment: environment
    projectName: projectName
  }
}

// ======================================
// Key Vault (para segredos compartilhados)
// ======================================
module keyVault './modules/keyvault.bicep' = {
  scope: rg
  name: 'keyVault'
  params: {
    location: location
    environment: environment
    projectName: projectName
  }
}

// ======================================
// Container Registry (para imagens de job)
// ======================================
module acr './modules/acr.bicep' = {
  scope: rg
  name: 'acr'
  params: {
    location: location
    environment: environment
    projectName: projectName
  }
}

// ======================================
// Storage (para logs e artefatos)
// ======================================
module storage './modules/storage.bicep' = {
  scope: rg
  name: 'storage'
  params: {
    location: location
    environment: environment
    projectName: projectName
  }
}

// ======================================
// Application Insights
// ======================================
module appInsights './modules/app-insights.bicep' = {
  scope: rg
  name: 'appInsights'
  params: {
    location: location
    environment: environment
    projectName: projectName
  }
}

output resourceGroupId string = rg.id
output controlPlaneUrl string = controlPlane.outputs.appServiceUrl
output keyVaultName string = keyVault.outputs.keyVaultName
output acrLoginServer string = acr.outputs.loginServer
output storageName string = storage.outputs.storageAccountName
output appInsightsInstrumentationKey string = appInsights.outputs.instrumentationKey
