const express = require('express');
const router = express.Router();
const licenseService = require('../services/licenseService');
const { requireAuth, requireClientAdmin } = require('../middleware/auth');

// ======================================
// LICENSE DASHBOARD
// ======================================

router.get('/clients/:clientId/dashboard', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const dashboard = await licenseService.getLicenseDashboard(req.params.clientId);
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// LICENSE SUMMARY BY TYPE
// ======================================

router.get('/clients/:clientId/summary', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const summary = await licenseService.getLicenseSummaryByType(req.params.clientId);
    res.json({ items: summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// LICENSE UTILIZATION
// ======================================

router.get('/clients/:clientId/utilization', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const utilization = await licenseService.getLicenseUtilization(req.params.clientId);
    res.json(utilization);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// UNUSED LICENSES
// ======================================

router.get('/clients/:clientId/unused', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const daysInactive = parseInt(req.query.daysInactive) || 30;
    const unused = await licenseService.getUnusedLicenses(req.params.clientId, daysInactive);

    res.json({
      items: unused,
      summary: {
        total: unused.length,
        critical: unused.filter(u => u.prioridade === 'Critical').length,
        high: unused.filter(u => u.prioridade === 'High').length,
        medium: unused.filter(u => u.prioridade === 'Medium').length,
        potentialSavings: unused.reduce((sum, u) => sum + (u.preco_unitario_brl || 0), 0),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// DOWNGRADE OPPORTUNITIES
// ======================================

router.get('/clients/:clientId/downgrade-opportunities', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const opportunities = await licenseService.getDowngradeOpportunities(req.params.clientId);

    res.json({
      items: opportunities,
      summary: {
        total: opportunities.length,
        potentialMonthlySavings: opportunities.reduce((sum, o) => sum + (o.economia_potencial || 0), 0),
        potentialAnnualSavings: opportunities.reduce((sum, o) => sum + (o.economia_potencial * 12 || 0), 0),
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// COST ANALYSIS
// ======================================

router.get('/clients/:clientId/costs', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const analysis = await licenseService.getCostAnalysis(req.params.clientId);
    res.json(analysis);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// RECOMMENDATIONS
// ======================================

router.get('/clients/:clientId/recommendations', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const recommendations = await licenseService.getRecommendations(req.params.clientId, limit);
    res.json(recommendations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.patch('/recommendations/:id/resolve', requireAuth, async (req, res) => {
  try {
    await licenseService.markRecommendationAsResolved(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// FULL REPORT
// ======================================

router.get('/clients/:clientId/report', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const report = await licenseService.generateLicenseReport(req.params.clientId);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// IMPORT LICENSE DATA
// ======================================

router.post('/clients/:clientId/import', requireAuth, requireClientAdmin, async (req, res) => {
  try {
    const licensesData = req.body;
    await licenseService.importLicenseData(licensesData);

    const dashboard = await licenseService.getLicenseDashboard(req.params.clientId);
    res.status(201).json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
