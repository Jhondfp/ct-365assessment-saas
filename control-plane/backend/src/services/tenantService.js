const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

class TenantService {
  async createTenant(tenantData) {
    const {
      client_id,
      m365_tenant_id,
      tenant_nome,
      sharepoint_site_urls = [],
      dominio_m365,
    } = tenantData;

    const tenantId = uuidv4();

    const query = `
      INSERT INTO [dbo].[tenants] (
        [id], [client_id], [m365_tenant_id], [tenant_nome],
        [dominio_m365], [status], [created_at], [updated_at]
      )
      VALUES (
        @tenantId, @clientId, @m365TenantId, @tenantNome,
        @dominioM365, 'provisioning', GETUTCDATE(), GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('tenantId', tenantId);
    request.input('clientId', client_id);
    request.input('m365TenantId', m365_tenant_id);
    request.input('tenantNome', tenant_nome);
    request.input('dominioM365', dominio_m365);

    await request.query(query);

    return {
      id: tenantId,
      client_id,
      m365_tenant_id,
      tenant_nome,
      dominio_m365,
      sharepoint_site_urls,
      status: 'provisioning',
    };
  }

  async getTenant(tenantId) {
    const query = `
      SELECT * FROM [dbo].[tenants] WHERE [id] = @tenantId
    `;

    const request = pool.request();
    request.input('tenantId', tenantId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Tenant not found');
    }

    return result.recordset[0];
  }

  async listClientTenants(clientId) {
    const query = `
      SELECT * FROM [dbo].[tenants] WHERE [client_id] = @clientId
      ORDER BY [created_at] DESC
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const result = await request.query(query);

    return result.recordset;
  }

  async updateTenant(tenantId, updates) {
    const allowedFields = [
      'tenant_nome', 'dominio_m365', 'status'
    ];

    const setClauses = [];
    const request = pool.request();
    request.input('tenantId', tenantId);
    request.input('updatedAt', new Date());

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        const paramName = `@${key}`;
        setClauses.push(`[${key}] = ${paramName}`);
        request.input(key, value);
      }
    }

    if (setClauses.length === 0) {
      throw new Error('No valid fields to update');
    }

    const query = `
      UPDATE [dbo].[tenants]
      SET ${setClauses.join(', ')}, [updated_at] = @updatedAt
      WHERE [id] = @tenantId
    `;

    await request.query(query);

    return this.getTenant(tenantId);
  }

  async createAppRegistration(tenantId, appData) {
    const {
      app_name,
      app_id,
      app_secret,
      scopes = ['https://graph.microsoft.com/.default'],
      redirect_uris = [],
    } = appData;

    const appRegId = uuidv4();

    const query = `
      INSERT INTO [dbo].[app_registrations] (
        [id], [tenant_id], [app_name], [app_id], [scopes],
        [redirect_uris], [status], [created_at], [updated_at]
      )
      VALUES (
        @appRegId, @tenantId, @appName, @appId, @scopes,
        @redirectUris, 'active', GETUTCDATE(), GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('appRegId', appRegId);
    request.input('tenantId', tenantId);
    request.input('appName', app_name);
    request.input('appId', app_id);
    request.input('scopes', JSON.stringify(scopes));
    request.input('redirectUris', JSON.stringify(redirect_uris));

    await request.query(query);

    return {
      id: appRegId,
      tenant_id: tenantId,
      app_name,
      app_id,
      scopes,
      redirect_uris,
      status: 'active',
    };
  }

  async getAppRegistration(appRegId) {
    const query = `
      SELECT * FROM [dbo].[app_registrations] WHERE [id] = @appRegId
    `;

    const request = pool.request();
    request.input('appRegId', appRegId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('App registration not found');
    }

    const record = result.recordset[0];
    return {
      ...record,
      scopes: JSON.parse(record.scopes || '[]'),
      redirect_uris: JSON.parse(record.redirect_uris || '[]'),
    };
  }

  async getTenantAppRegistration(tenantId) {
    const query = `
      SELECT * FROM [dbo].[app_registrations] WHERE [tenant_id] = @tenantId
    `;

    const request = pool.request();
    request.input('tenantId', tenantId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return null;
    }

    const record = result.recordset[0];
    return {
      ...record,
      scopes: JSON.parse(record.scopes || '[]'),
      redirect_uris: JSON.parse(record.redirect_uris || '[]'),
    };
  }

  async addSharePointSite(tenantId, siteData) {
    const {
      site_url,
      site_name,
      site_id,
      admin_email,
    } = siteData;

    const spSiteId = uuidv4();

    const query = `
      INSERT INTO [dbo].[sharepoint_sites] (
        [id], [tenant_id], [site_url], [site_name], [site_id],
        [admin_email], [status], [created_at]
      )
      VALUES (
        @spSiteId, @tenantId, @siteUrl, @siteName, @siteId,
        @adminEmail, 'active', GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('spSiteId', spSiteId);
    request.input('tenantId', tenantId);
    request.input('siteUrl', site_url);
    request.input('siteName', site_name);
    request.input('siteId', site_id);
    request.input('adminEmail', admin_email);

    await request.query(query);

    return {
      id: spSiteId,
      tenant_id: tenantId,
      site_url,
      site_name,
      site_id,
      admin_email,
      status: 'active',
    };
  }

  async listTenantSharePointSites(tenantId) {
    const query = `
      SELECT * FROM [dbo].[sharepoint_sites]
      WHERE [tenant_id] = @tenantId AND [status] = 'active'
      ORDER BY [created_at] DESC
    `;

    const request = pool.request();
    request.input('tenantId', tenantId);
    const result = await request.query(query);

    return result.recordset;
  }

  async getTenantWithDetails(tenantId) {
    const tenant = await this.getTenant(tenantId);
    const appReg = await this.getTenantAppRegistration(tenantId);
    const sites = await this.listTenantSharePointSites(tenantId);

    return {
      ...tenant,
      app_registration: appReg,
      sharepoint_sites: sites,
    };
  }

  async initializeDatabase(tenantId) {
    try {
      const tenant = await this.getTenant(tenantId);
      const dbName = `ct_assessment_${tenant.m365_tenant_id.replace(/-/g, '_')}`;

      const createDbQuery = `
        IF NOT EXISTS (SELECT * FROM sys.databases WHERE name = N'${dbName}')
        CREATE DATABASE [${dbName}]
      `;

      await pool.request().query(createDbQuery);

      return {
        tenant_id: tenantId,
        database_name: dbName,
        initialized: true,
      };
    } catch (error) {
      throw new Error(`Failed to initialize tenant database: ${error.message}`);
    }
  }
}

module.exports = new TenantService();
