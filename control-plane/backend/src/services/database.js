const { Pool, Client } = require('pg');
const config = require('../config');
const logger = require('../config/logger');

// Pool de conexão para Control Plane (banco único)
let controlPlanePool = null;

// Pools de conexão para tenants isolados (cada cliente tem seu banco)
const tenantPools = new Map();

const cpDbConfig = {
  host: config.CP_DB_SERVER,
  port: config.CP_DB_PORT || 5432,
  database: config.CP_DB_NAME,
  user: config.CP_DB_USER,
  password: config.CP_DB_PASSWORD,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: {
    rejectUnauthorized: false
  }
};

const getControlPlaneConnection = async () => {
  try {
    if (!controlPlanePool) {
      controlPlanePool = new Pool(cpDbConfig);
      await controlPlanePool.query('SELECT NOW()');
      logger.info('✓ Connected to PostgreSQL Database (Control Plane)');
    }
    return controlPlanePool;
  } catch (err) {
    logger.error(`Control Plane database connection error: ${err.message}`);
    throw err;
  }
};

const getTenantConnection = async (tenantId) => {
  try {
    if (tenantPools.has(tenantId)) {
      return tenantPools.get(tenantId);
    }

    // Buscar credenciais do tenant do banco de controle
    const cpPool = await getControlPlaneConnection();
    const result = await cpPool.query(
      'SELECT db_connection_string FROM tenants WHERE id = $1',
      [tenantId]
    );

    if (!result.rows[0]) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const connectionString = result.rows[0].db_connection_string;
    const tenantPool = new Pool({ connectionString });
    await tenantPool.query('SELECT NOW()');

    tenantPools.set(tenantId, tenantPool);
    logger.info(`✓ Connected to PostgreSQL Database (Tenant: ${tenantId})`);
    return tenantPool;
  } catch (err) {
    logger.error(`Tenant database connection error: ${err.message}`);
    throw err;
  }
};

// ======================================
// USERS
// ======================================
const getUserByEntraId = async (entraObjectId) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query(
      'SELECT * FROM users WHERE entra_object_id = $1 AND ativo = true',
      [entraObjectId]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error(`Error getting user by Entra ID: ${err.message}`);
    throw err;
  }
};

const getUserById = async (userId) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query(
      'SELECT * FROM users WHERE id = $1 AND ativo = true',
      [userId]
    );
    return result.rows[0] || null;
  } catch (err) {
    logger.error(`Error getting user: ${err.message}`);
    throw err;
  }
};

const createUser = async (user) => {
  try {
    const pool = await getControlPlaneConnection();
    await pool.query(
      `INSERT INTO users (id, entra_object_id, nome, email, papel)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, user.entra_object_id, user.nome, user.email, user.papel]
    );
    logger.info(`User created: ${user.email}`);
  } catch (err) {
    logger.error(`Error creating user: ${err.message}`);
    throw err;
  }
};

const updateUserLastAccess = async (userId) => {
  try {
    const pool = await getControlPlaneConnection();
    await pool.query(
      'UPDATE users SET ultimo_acesso = NOW() WHERE id = $1',
      [userId]
    );
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
    const pool = await getControlPlaneConnection();
    const offset = page * limit;
    const result = await pool.query(
      `SELECT * FROM clients
       WHERE status != 'terminated'
       ORDER BY criado_em DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  } catch (err) {
    logger.error(`Error listing clients: ${err.message}`);
    throw err;
  }
};

const getClientById = async (clientId) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [clientId]);
    return result.rows[0] || null;
  } catch (err) {
    logger.error(`Error getting client: ${err.message}`);
    throw err;
  }
};

const createClient = async (client) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query(
      `INSERT INTO clients (razao_social, cnpj, email_contato, regiao)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [client.razao_social, client.cnpj, client.email_contato, client.regiao || 'brazilsouth']
    );
    return result.rows[0];
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
    const pool = await getControlPlaneConnection();
    const result = await pool.query(
      'SELECT * FROM tenants WHERE client_id = $1 ORDER BY criado_em DESC',
      [clientId]
    );
    return result.rows;
  } catch (err) {
    logger.error(`Error listing tenants: ${err.message}`);
    throw err;
  }
};

const getTenantById = async (tenantId) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    return result.rows[0] || null;
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
    const pool = await getControlPlaneConnection();
    const result = await pool.query(
      `SELECT * FROM executions
       WHERE tenant_id = $1
       ORDER BY iniciado_em DESC
       LIMIT $2`,
      [tenantId, limit]
    );
    return result.rows;
  } catch (err) {
    logger.error(`Error listing executions: ${err.message}`);
    throw err;
  }
};

const getExecutionById = async (executionId) => {
  try {
    const pool = await getControlPlaneConnection();
    const result = await pool.query('SELECT * FROM executions WHERE id = $1', [executionId]);
    return result.rows[0] || null;
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
    const pool = await getControlPlaneConnection();
    await pool.query(
      `INSERT INTO audit_log (user_id, acao, alvo_tipo, alvo_id, detalhes_json, endereco_ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        auditEntry.user_id,
        auditEntry.acao,
        auditEntry.alvo_tipo,
        auditEntry.alvo_id,
        auditEntry.detalhes_json ? JSON.stringify(auditEntry.detalhes_json) : null,
        auditEntry.endereco_ip,
        auditEntry.user_agent
      ]
    );
  } catch (err) {
    logger.error(`Error logging audit: ${err.message}`);
    // Não throw - audit log falho não deve quebrar a operação principal
  }
};

module.exports = {
  getControlPlaneConnection,
  getTenantConnection,

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
