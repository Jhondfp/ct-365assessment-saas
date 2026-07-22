const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

class UserService {
  async createUser(userData) {
    const {
      name,
      email,
      client_id = null,
      tipo = 'customer',
      cargo = null,
      telefone = null,
      idioma = 'pt-BR',
      timezone = 'America/Sao_Paulo',
      password_hash = null,
    } = userData;

    const userId = uuidv4();

    const query = `
      INSERT INTO [dbo].[users] (
        [id], [name], [email], [client_id], [tipo], [cargo],
        [telefone], [idioma], [timezone], [password_hash],
        [status], [created_at], [updated_at]
      )
      VALUES (
        @userId, @name, @email, @clientId, @tipo, @cargo,
        @telefone, @idioma, @timezone, @passwordHash,
        'active', GETUTCDATE(), GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('userId', userId);
    request.input('name', name);
    request.input('email', email);
    request.input('clientId', client_id);
    request.input('tipo', tipo);
    request.input('cargo', cargo);
    request.input('telefone', telefone);
    request.input('idioma', idioma);
    request.input('timezone', timezone);
    request.input('passwordHash', password_hash);

    await request.query(query);

    return {
      id: userId,
      name,
      email,
      client_id,
      tipo,
      cargo,
      telefone,
      idioma,
      timezone,
      status: 'active',
    };
  }

  async getUser(userId) {
    const query = `
      SELECT [id], [name], [email], [client_id], [tipo], [cargo],
             [telefone], [idioma], [timezone], [status], [created_at], [updated_at]
      FROM [dbo].[users]
      WHERE [id] = @userId
    `;

    const request = pool.request();
    request.input('userId', userId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('User not found');
    }

    return result.recordset[0];
  }

  async getUserByEmail(email) {
    const query = `
      SELECT [id], [name], [email], [client_id], [tipo], [cargo],
             [telefone], [idioma], [timezone], [status], [created_at], [updated_at]
      FROM [dbo].[users]
      WHERE [email] = @email
    `;

    const request = pool.request();
    request.input('email', email);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }

  async listClientUsers(clientId, skip = 0, take = 10) {
    const query = `
      SELECT [id], [name], [email], [client_id], [tipo], [cargo],
             [telefone], [idioma], [timezone], [status], [created_at]
      FROM [dbo].[users]
      WHERE [client_id] = @clientId
      ORDER BY [created_at] DESC
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    request.input('skip', skip);
    request.input('take', take);
    const result = await request.query(query);

    const countQuery = `
      SELECT COUNT(*) as total FROM [dbo].[users]
      WHERE [client_id] = @clientId
    `;
    const countRequest = pool.request();
    countRequest.input('clientId', clientId);
    const countResult = await countRequest.query(countQuery);

    return {
      items: result.recordset,
      total: countResult.recordset[0].total,
      skip,
      take,
    };
  }

  async updateUser(userId, updates) {
    const allowedFields = [
      'name', 'cargo', 'telefone', 'idioma', 'timezone', 'status'
    ];

    const setClauses = [];
    const request = pool.request();
    request.input('userId', userId);
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
      UPDATE [dbo].[users]
      SET ${setClauses.join(', ')}, [updated_at] = @updatedAt
      WHERE [id] = @userId
    `;

    await request.query(query);

    return this.getUser(userId);
  }

  async deleteUser(userId) {
    const query = `
      UPDATE [dbo].[users] SET [status] = 'inactive'
      WHERE [id] = @userId
    `;

    const request = pool.request();
    request.input('userId', userId);
    await request.query(query);

    return this.getUser(userId);
  }

  async createInvitation(invitationData) {
    const {
      creator_user_id,
      client_id,
      email,
      tipo = 'customer',
      cargo = null,
    } = invitationData;

    const inviteId = uuidv4();
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const query = `
      INSERT INTO [dbo].[user_invites] (
        [id], [creator_user_id], [client_id], [email], [tipo], [cargo],
        [token], [expires_at], [status], [created_at]
      )
      VALUES (
        @inviteId, @creatorUserId, @clientId, @email, @tipo, @cargo,
        @token, @expiresAt, 'pending', GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('inviteId', inviteId);
    request.input('creatorUserId', creator_user_id);
    request.input('clientId', client_id);
    request.input('email', email);
    request.input('tipo', tipo);
    request.input('cargo', cargo);
    request.input('token', token);
    request.input('expiresAt', expiresAt);

    await request.query(query);

    return {
      id: inviteId,
      creator_user_id,
      client_id,
      email,
      tipo,
      cargo,
      token,
      expires_at: expiresAt,
      status: 'pending',
    };
  }

  async getInvitation(token) {
    const query = `
      SELECT * FROM [dbo].[user_invites]
      WHERE [token] = @token
    `;

    const request = pool.request();
    request.input('token', token);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Invitation not found');
    }

    const invite = result.recordset[0];

    // Check if expired
    if (new Date(invite.expires_at) < new Date()) {
      throw new Error('Invitation expired');
    }

    if (invite.status !== 'pending') {
      throw new Error(`Invitation already ${invite.status}`);
    }

    return invite;
  }

  async acceptInvitation(token, userData) {
    const {
      password_hash,
      telefone = null,
    } = userData;

    const invite = await this.getInvitation(token);

    // Create user
    const user = await this.createUser({
      name: userData.name || invite.email,
      email: invite.email,
      client_id: invite.client_id,
      tipo: invite.tipo,
      cargo: invite.cargo,
      telefone,
      password_hash,
    });

    // Update invitation status
    const updateQuery = `
      UPDATE [dbo].[user_invites]
      SET [status] = 'accepted', [accepted_at] = GETUTCDATE()
      WHERE [token] = @token
    `;

    const request = pool.request();
    request.input('token', token);
    await request.query(updateQuery);

    return {
      user,
      invitation_id: invite.id,
    };
  }

  async listPendingInvitations(clientId) {
    const query = `
      SELECT * FROM [dbo].[user_invites]
      WHERE [client_id] = @clientId AND [status] = 'pending'
      AND [expires_at] > GETUTCDATE()
      ORDER BY [created_at] DESC
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const result = await request.query(query);

    return result.recordset;
  }

  async cancelInvitation(inviteId) {
    const query = `
      UPDATE [dbo].[user_invites]
      SET [status] = 'cancelled'
      WHERE [id] = @inviteId
    `;

    const request = pool.request();
    request.input('inviteId', inviteId);
    await request.query(query);
  }
}

module.exports = new UserService();
