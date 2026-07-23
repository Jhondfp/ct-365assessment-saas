const express = require('express');
const completeGovernanceService = require('../services/completeGovernanceService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Middleware to extract client and tenant info
router.use(requireAuth);

// Get governance overview
router.get('/clients/:clientId/overview', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId; // Use tenant context if available

    const result = await completeGovernanceService.getOverview(tenantId);
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get sites health distribution
router.get('/clients/:clientId/sites', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { search = '', healthMin = 0 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getSitesDetail(tenantId, search, parseInt(healthMin));
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get security findings
router.get('/clients/:clientId/security/findings', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { status = 'open' } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getSecurityFindings(tenantId, status);
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get compliance framework
router.get('/clients/:clientId/security/compliance', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getComplianceFramework(tenantId);
    if (result.success) {
      // Group by framework
      const grouped = {};
      result.data.forEach(item => {
        if (!grouped[item.framework_name]) {
          grouped[item.framework_name] = [];
        }
        grouped[item.framework_name].push(item);
      });

      res.json({
        success: true,
        data: grouped,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get sharing analysis
router.get('/clients/:clientId/sharing', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getSharingAnalysis(tenantId);
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get risky shares
router.get('/clients/:clientId/sharing/risky', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limit = 100 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getRiskyShares(tenantId, parseInt(limit));
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user permission risks
router.get('/clients/:clientId/permissions/risks', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getUserPermissionRisks(tenantId);
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get excessive permissions
router.get('/clients/:clientId/permissions/excessive', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limit = 100 } = req.query;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getExcessivePermissions(tenantId, parseInt(limit));
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get storage recommendations
router.get('/clients/:clientId/storage/recommendations', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.getStorageRecommendations(tenantId);
    if (result.success) {
      res.json({
        success: true,
        data: result.data,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Refresh governance data
router.post('/clients/:clientId/refresh', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.refreshGovernanceAggregates(tenantId);
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Seed demo data (development only)
router.post('/clients/:clientId/seed', async (req, res) => {
  try {
    const { clientId } = req.params;
    const tenantId = req.tenant?.id || clientId;

    const result = await completeGovernanceService.seedGovernanceData(tenantId);
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
