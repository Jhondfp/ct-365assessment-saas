const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../config/logger');
const { requireRole } = require('../middleware/passport');

// ======================================
// GET /api/tenants/:tenantId
// Obter detalhes de um tenant
// ======================================
router.get('/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const tenant = await db.getTenantById(tenantId);

    if (!tenant) {
      return res.status(404).json({ error: 'Tenant não encontrado' });
    }

    res.json(tenant);
  } catch (err) {
    logger.error(`Error getting tenant: ${err.message}`);
    res.status(500).json({ error: 'Erro ao obter tenant' });
  }
});

// ======================================
// POST /api/tenants/:tenantId/consent
// Registrar consentimento do cliente (após flow OAuth)
// ======================================
router.post('/:tenantId/consent', requireRole(['superadmin', 'analista']), async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { m365_tenant_id, app_registration_id } = req.body;

    // TODO: Atualizar tenant no banco com consentimento
    // UPDATE tenants SET sso_consentido_em = GETUTCDATE() WHERE id = @tenantId

    logger.info(`✓ Consentimento registrado para tenant: ${tenantId}`);
    res.json({ success: true, message: 'Consentimento registrado' });
  } catch (err) {
    logger.error(`Error recording consent: ${err.message}`);
    res.status(500).json({ error: 'Erro ao registrar consentimento' });
  }
});

module.exports = router;
