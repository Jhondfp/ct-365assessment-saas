const express = require('express');
const router = express.Router();
const clientService = require('../services/clientService');
const tenantService = require('../services/tenantService');
const userService = require('../services/userService');
const emailService = require('../services/email');
const { requireAuth } = require('../middleware/auth');

// ======================================
// CLIENT MANAGEMENT
// ======================================

router.post('/clients', requireAuth, async (req, res) => {
  try {
    const { razao_social, cnpj, email_contato, telefone, endereco, cidade, estado, cep, website, industria, tamanho_empresa } = req.body;

    if (!razao_social || !cnpj || !email_contato) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const client = await clientService.createClient({
      razao_social,
      cnpj,
      email_contato,
      telefone,
      endereco,
      cidade,
      estado,
      cep,
      website,
      industria,
      tamanho_empresa,
    });

    res.status(201).json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients', requireAuth, async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 10;

    const result = await clientService.listClients(skip, take);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:id', requireAuth, async (req, res) => {
  try {
    const client = await clientService.getClientWithTenants(req.params.id);
    res.json(client);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.get('/clients/:id/stats', requireAuth, async (req, res) => {
  try {
    const stats = await clientService.getClientStats(req.params.id);
    res.json(stats);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/clients/:id', requireAuth, async (req, res) => {
  try {
    const client = await clientService.updateClient(req.params.id, req.body);
    res.json(client);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// TENANT MANAGEMENT
// ======================================

router.post('/clients/:clientId/tenants', requireAuth, async (req, res) => {
  try {
    const { m365_tenant_id, tenant_nome, dominio_m365, sharepoint_site_urls } = req.body;

    if (!m365_tenant_id || !tenant_nome) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const tenant = await tenantService.createTenant({
      client_id: req.params.clientId,
      m365_tenant_id,
      tenant_nome,
      dominio_m365,
      sharepoint_site_urls,
    });

    // Initialize isolated database
    await tenantService.initializeDatabase(tenant.id);

    // Update status
    const updatedTenant = await tenantService.updateTenant(tenant.id, { status: 'active' });

    res.status(201).json(updatedTenant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/tenants', requireAuth, async (req, res) => {
  try {
    const tenants = await tenantService.listClientTenants(req.params.clientId);
    res.json(tenants);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tenants/:id', requireAuth, async (req, res) => {
  try {
    const tenant = await tenantService.getTenantWithDetails(req.params.id);
    res.json(tenant);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.post('/tenants/:tenantId/app-registration', requireAuth, async (req, res) => {
  try {
    const { app_name, app_id, app_secret, scopes, redirect_uris } = req.body;

    if (!app_id) {
      return res.status(400).json({ error: 'Missing app_id' });
    }

    const appReg = await tenantService.createAppRegistration(req.params.tenantId, {
      app_name,
      app_id,
      app_secret,
      scopes,
      redirect_uris,
    });

    res.status(201).json(appReg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/tenants/:tenantId/sharepoint-sites', requireAuth, async (req, res) => {
  try {
    const { site_url, site_name, site_id, admin_email } = req.body;

    if (!site_url) {
      return res.status(400).json({ error: 'Missing site_url' });
    }

    const site = await tenantService.addSharePointSite(req.params.tenantId, {
      site_url,
      site_name,
      site_id,
      admin_email,
    });

    res.status(201).json(site);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tenants/:tenantId/sharepoint-sites', requireAuth, async (req, res) => {
  try {
    const sites = await tenantService.listTenantSharePointSites(req.params.tenantId);
    res.json(sites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// USER MANAGEMENT
// ======================================

router.post('/clients/:clientId/users/invite', requireAuth, async (req, res) => {
  try {
    const { email, tipo = 'customer', cargo } = req.body;
    const creatorUserId = req.user.id;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }

    const invitation = await userService.createInvitation({
      creator_user_id: creatorUserId,
      client_id: req.params.clientId,
      email,
      tipo,
      cargo,
    });

    // Send invitation email
    try {
      const client = await clientService.getClient(req.params.clientId);
      await emailService.sendInvitationEmail(email, invitation.token, client.razao_social);
    } catch (emailError) {
      console.error('Failed to send invitation email:', emailError);
    }

    res.status(201).json({
      invitation_id: invitation.id,
      email: invitation.email,
      expires_at: invitation.expires_at,
      status: 'sent',
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/users', requireAuth, async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 10;

    const result = await userService.listClientUsers(req.params.clientId, skip, take);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/users/invitations', requireAuth, async (req, res) => {
  try {
    const invitations = await userService.listPendingInvitations(req.params.clientId);
    res.json(invitations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/clients/:clientId/users/invitations/:inviteId', requireAuth, async (req, res) => {
  try {
    await userService.cancelInvitation(req.params.inviteId);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/users/:id', requireAuth, async (req, res) => {
  try {
    const user = await userService.getUser(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

router.put('/users/:id', requireAuth, async (req, res) => {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/users/:id', requireAuth, async (req, res) => {
  try {
    const user = await userService.deleteUser(req.params.id);
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
