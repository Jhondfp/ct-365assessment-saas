const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');

class ClientService {
  async createClient(clientData) {
    const {
      razao_social,
      cnpj,
      email_contato,
      telefone,
      endereco,
      cidade,
      estado,
      cep,
      pais = 'Brasil',
      industria,
      tamanho_empresa,
      website,
    } = clientData;

    const clientId = uuidv4();

    const query = `
      INSERT INTO [dbo].[clients] (
        [id], [razao_social], [cnpj], [email_contato], [telefone],
        [endereco], [cidade], [estado], [cep], [pais], [industria],
        [tamanho_empresa], [website], [status], [created_at], [updated_at]
      )
      VALUES (
        @clientId, @razaoSocial, @cnpj, @emailContato, @telefone,
        @endereco, @cidade, @estado, @cep, @pais, @industria,
        @tamanhoEmpresa, @website, 'active', GETUTCDATE(), GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    request.input('razaoSocial', razao_social);
    request.input('cnpj', cnpj);
    request.input('emailContato', email_contato);
    request.input('telefone', telefone);
    request.input('endereco', endereco);
    request.input('cidade', cidade);
    request.input('estado', estado);
    request.input('cep', cep);
    request.input('pais', pais);
    request.input('industria', industria);
    request.input('tamanhoEmpresa', tamanho_empresa);
    request.input('website', website);

    await request.query(query);

    return { id: clientId, ...clientData, status: 'active' };
  }

  async getClient(clientId) {
    const query = `
      SELECT * FROM [dbo].[clients] WHERE [id] = @clientId
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Client not found');
    }

    return result.recordset[0];
  }

  async listClients(skip = 0, take = 10) {
    const query = `
      SELECT * FROM [dbo].[clients]
      ORDER BY [created_at] DESC
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const request = pool.request();
    request.input('skip', skip);
    request.input('take', take);
    const result = await request.query(query);

    const countQuery = `SELECT COUNT(*) as total FROM [dbo].[clients]`;
    const countResult = await pool.request().query(countQuery);

    return {
      items: result.recordset,
      total: countResult.recordset[0].total,
      skip,
      take,
    };
  }

  async updateClient(clientId, updates) {
    const allowedFields = [
      'razao_social', 'email_contato', 'telefone', 'endereco', 'cidade',
      'estado', 'cep', 'website', 'industria', 'status'
    ];

    const setClauses = [];
    const request = pool.request();
    request.input('clientId', clientId);
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
      UPDATE [dbo].[clients]
      SET ${setClauses.join(', ')}, [updated_at] = @updatedAt
      WHERE [id] = @clientId
    `;

    await request.query(query);

    return this.getClient(clientId);
  }

  async deleteClient(clientId) {
    const client = await this.getClient(clientId);

    const query = `
      UPDATE [dbo].[clients] SET [status] = 'inactive'
      WHERE [id] = @clientId
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    await request.query(query);

    return { ...client, status: 'inactive' };
  }

  async getClientWithTenants(clientId) {
    const client = await this.getClient(clientId);

    const tenantsQuery = `
      SELECT * FROM [dbo].[tenants] WHERE [client_id] = @clientId
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const tenantsResult = await request.query(tenantsQuery);

    return {
      ...client,
      tenants: tenantsResult.recordset,
    };
  }

  async getClientStats(clientId) {
    const query = `
      SELECT
        c.[id],
        c.[razao_social],
        (SELECT COUNT(*) FROM [dbo].[tenants] WHERE [client_id] = c.[id]) as tenant_count,
        (SELECT COUNT(*) FROM [dbo].[users] WHERE [client_id] = c.[id]) as user_count,
        (SELECT COUNT(*) FROM [dbo].[executions] WHERE [client_id] = c.[id]) as execution_count,
        cc.[creditos_atuais],
        cc.[creditos_consumidos_mes],
        cp.[nome] as plan_name
      FROM [dbo].[clients] c
      LEFT JOIN [dbo].[client_credits] cc ON c.[id] = cc.[client_id]
      LEFT JOIN [dbo].[credit_plans] cp ON cc.[plan_id] = cp.[id]
      WHERE c.[id] = @clientId
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Client not found');
    }

    return result.recordset[0];
  }
}

module.exports = new ClientService();
