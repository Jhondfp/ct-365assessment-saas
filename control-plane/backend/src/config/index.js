module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',

  // Azure Identity
  AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
  AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
  AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
  AZURE_SUBSCRIPTION_ID: process.env.AZURE_SUBSCRIPTION_ID,

  // Database (Control Plane) - PostgreSQL
  CP_DB_SERVER: process.env.CP_DB_SERVER,
  CP_DB_PORT: process.env.CP_DB_PORT || 5432,
  CP_DB_NAME: process.env.CP_DB_NAME,
  CP_DB_USER: process.env.CP_DB_USER,
  CP_DB_PASSWORD: process.env.CP_DB_PASSWORD,

  // Key Vault
  KEYVAULT_URL: process.env.KEYVAULT_URL,

  // Customer App Registration (para onboarding)
  CUSTOMER_APP_REGISTRATION_ID: process.env.CUSTOMER_APP_REGISTRATION_ID,
  CUSTOMER_APP_REGISTRATION_SECRET: process.env.CUSTOMER_APP_REGISTRATION_SECRET,

  // Configurações gerais
  RESOURCE_GROUP: process.env.RESOURCE_GROUP,
  ACR_LOGIN_SERVER: process.env.ACR_LOGIN_SERVER,
  DEFAULT_REGION: process.env.DEFAULT_REGION || 'brazilsouth',

  // FinOps
  FINOPS_COST_PER_GB: parseFloat(process.env.FINOPS_COST_PER_GB) || 0.50,
  FINOPS_COST_PER_EXECUTION: parseFloat(process.env.FINOPS_COST_PER_EXECUTION) || 5.00,

  // Segurança
  JWT_SECRET: process.env.JWT_SECRET,
  SESSION_SECRET: process.env.SESSION_SECRET,
  CORS_ORIGINS: process.env.CORS_ORIGINS || 'http://localhost:3000,http://localhost:3001',

  // Logging
  APPINSIGHTS_CONNECTION_STRING: process.env.APPINSIGHTS_CONNECTION_STRING,

  // Email (SendGrid)
  SENDGRID_API_KEY: process.env.SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL: process.env.SENDGRID_FROM_EMAIL || 'noreply@ctassessment.com.br',
  SENDGRID_REPLY_TO: process.env.SENDGRID_REPLY_TO || 'support@ctassessment.com.br',

  // Storage (Azure Blob)
  AZURE_STORAGE_CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,

  // Validações
  validateRequired: () => {
    const required = [
      'AZURE_TENANT_ID',
      'AZURE_CLIENT_ID',
      'AZURE_CLIENT_SECRET',
      'CP_DB_SERVER',
      'CP_DB_NAME',
      'CP_DB_USER',
      'CP_DB_PASSWORD',
      'KEYVAULT_URL',
      'JWT_SECRET',
      'SESSION_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Variáveis de ambiente obrigatórias ausentes: ${missing.join(', ')}`);
    }
  }
};
