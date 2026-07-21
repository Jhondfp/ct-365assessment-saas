const sql = require('mssql');
const config = require('../config');
const logger = require('../config/logger');

let connectionPool = null;

const dbConfig = {
  server: config.CP_DB_SERVER,
  database: config.CP_DB_NAME,
  user: config.CP_DB_USER,
  password: config.CP_DB_PASSWORD,
  port: 1433,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 30000
  },
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 30000
  }
};

const getConnection = async () => {
  try {
    if (!connectionPool) {
      connectionPool = new sql.ConnectionPool(dbConfig);
      await connectionPool.connect();
      logger.info('✓ Connected to SQL Database (Control Plane)');
    }
    return connectionPool;
  } catch (err) {
    logger.error(`Database connection error: ${err.message}`);
    throw err;
  }
};

// ======================================
// USERS
// ======================================
const getUserByEntraId = async (entraObjectId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('entraObjectId', sql.UniqueIdentifier, entraObjectId)
      .query('SELECT * FROM [dbo].[users] WHERE [entra_object_id] = @entraObjectId AND [ativo] = 1');
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting user by Entra ID: ${err.message}`);
    throw err;
  }
};

const getUserById = async (userId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query('SELECT * FROM [dbo].[users] WHERE [id] = @userId AND [ativo] = 1');
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting user: ${err.message}`);
    throw err;
  }
};

const createUser = async (user) => {
  try {
    const pool = await getConnection();
    await pool
      .request()
      .input('id', sql.UniqueIdentifier, user.id)
      .input('entraObjectId', sql.UniqueIdentifier, user.entra_object_id)
      .input('nome', sql.NVarChar(255), user.nome)
      .input('email', sql.NVarChar(255), user.email)
      .input('papel', sql.VarChar(20), user.papel)
      .query(
        `INSERT INTO [dbo].[users]
         ([id], [entra_object_id], [nome], [email], [papel])
         VALUES (@id, @entraObjectId, @nome, @email, @papel)`
      );
    logger.info(`User created: ${user.email}`);
  } catch (err) {
    logger.error(`Error creating user: ${err.message}`);
    throw err;
  }
};

const updateUserLastAccess = async (userId) => {
  try {
    const pool = await getConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, userId)
      .query('UPDATE [dbo].[users] SET [ultimo_acesso] = GETUTCDATE() WHERE [id] = @userId');
  } catch (err) {
    logger.error(`Error updating last access: ${err.message}`);
    throw err;
  }
};

// ======================================
// CLIENTS
// ======================================
const listClients = async (page = 0, limit = 20) => {
  try {
    const pool = await getConnection();
    const offset = page * limit;
    const result = await pool
      .request()
      .input('offset', sql.Int, offset)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT * FROM [dbo].[clients]
         WHERE [status] != 'terminated'
         ORDER BY [criado_em] DESC
         OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
      );
    return result.recordset;
  } catch (err) {
    logger.error(`Error listing clients: ${err.message}`);
    throw err;
  }
};

const getClientById = async (clientId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('clientId', sql.UniqueIdentifier, clientId)
      .query('SELECT * FROM [dbo].[clients] WHERE [id] = @clientId');
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting client: ${err.message}`);
    throw err;
  }
};

const createClient = async (client) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('razaoSocial', sql.NVarChar(255), client.razao_social)
      .input('cnpj', sql.VarChar(14), client.cnpj)
      .input('emailContato', sql.NVarChar(255), client.email_contato)
      .input('regiao', sql.VarChar(20), client.regiao || 'brazilsouth')
      .query(
        `INSERT INTO [dbo].[clients]
         ([razao_social], [cnpj], [email_contato], [regiao])
         VALUES (@razaoSocial, @cnpj, @emailContato, @regiao);
         SELECT * FROM [dbo].[clients] WHERE [cnpj] = @cnpj`
      );
    return result.recordset[0];
  } catch (err) {
    logger.error(`Error creating client: ${err.message}`);
    throw err;
  }
};

// ======================================
// TENANTS
// ======================================
const listTenantsByClient = async (clientId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('clientId', sql.UniqueIdentifier, clientId)
      .query('SELECT * FROM [dbo].[tenants] WHERE [client_id] = @clientId ORDER BY [criado_em] DESC');
    return result.recordset;
  } catch (err) {
    logger.error(`Error listing tenants: ${err.message}`);
    throw err;
  }
};

const getTenantById = async (tenantId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query('SELECT * FROM [dbo].[tenants] WHERE [id] = @tenantId');
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting tenant: ${err.message}`);
    throw err;
  }
};

// ======================================
// EXECUTIONS
// ======================================
const listExecutionsByTenant = async (tenantId, limit = 20) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('limit', sql.Int, limit)
      .query(
        `SELECT TOP (@limit) * FROM [dbo].[executions]
         WHERE [tenant_id] = @tenantId
         ORDER BY [iniciado_em] DESC`
      );
    return result.recordset;
  } catch (err) {
    logger.error(`Error listing executions: ${err.message}`);
    throw err;
  }
};

const getExecutionById = async (executionId) => {
  try {
    const pool = await getConnection();
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .query('SELECT * FROM [dbo].[executions] WHERE [id] = @executionId');
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting execution: ${err.message}`);
    throw err;
  }
};

// ======================================
// AUDIT LOG
// ======================================
const logAudit = async (auditEntry) => {
  try {
    const pool = await getConnection();
    await pool
      .request()
      .input('userId', sql.UniqueIdentifier, auditEntry.user_id)
      .input('acao', sql.VarChar(50), auditEntry.acao)
      .input('alvoTipo', sql.VarChar(30), auditEntry.alvo_tipo)
      .input('alvoId', sql.UniqueIdentifier, auditEntry.alvo_id)
      .input('detalhes', sql.NVarChar(sql.MAX), auditEntry.detalhes_json ? JSON.stringify(auditEntry.detalhes_json) : null)
      .input('endereco', sql.VarChar(45), auditEntry.endereco_ip)
      .input('userAgent', sql.NVarChar(sql.MAX), auditEntry.user_agent)
      .query(
        `INSERT INTO [dbo].[audit_log]
         ([user_id], [acao], [alvo_tipo], [alvo_id], [detalhes_json], [endereco_ip], [user_agent])
         VALUES (@userId, @acao, @alvoTipo, @alvoId, @detalhes, @endereco, @userAgent)`
      );
  } catch (err) {
    logger.error(`Error logging audit: ${err.message}`);
    // Não throw - audit log falho não deve quebrar a operação principal
  }
};

module.exports = {
  getConnection,

  // Users
  getUserByEntraId,
  getUserById,
  createUser,
  updateUserLastAccess,

  // Clients
  listClients,
  getClientById,
  createClient,

  // Tenants
  listTenantsByClient,
  getTenantById,

  // Executions
  listExecutionsByTenant,
  getExecutionById,

  // Audit
  logAudit
};
