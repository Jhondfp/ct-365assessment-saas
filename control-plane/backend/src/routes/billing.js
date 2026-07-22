const express = require('express');
const router = express.Router();
const billingService = require('../services/billingService');
const clientService = require('../services/clientService');
const { requireAuth } = require('../middleware/auth');

// ======================================
// CREDIT PLANS
// ======================================

router.get('/credit-plans', async (req, res) => {
  try {
    const plans = await billingService.getCreditPlans();
    res.json(plans);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ======================================
// CLIENT BILLING
// ======================================

router.post('/clients/:clientId/credits/purchase', requireAuth, async (req, res) => {
  try {
    const { quantity, payment_method = 'credit_card' } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }

    const transaction = await billingService.purchaseCredits(req.params.clientId, quantity, {
      payment_method,
      purchased_by: req.user.id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/credits', requireAuth, async (req, res) => {
  try {
    const credits = await billingService.getClientCredits(req.params.clientId);
    if (!credits) {
      return res.status(404).json({ error: 'No credit plan found for this client' });
    }
    res.json(credits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/credits/transactions', requireAuth, async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 20;

    const transactions = await billingService.getCreditTransactionHistory(req.params.clientId, skip, take);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/billing/dashboard', requireAuth, async (req, res) => {
  try {
    const dashboard = await billingService.getBillingDashboard(req.params.clientId);
    if (!dashboard) {
      return res.status(404).json({ error: 'No credit plan found for this client' });
    }
    res.json(dashboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clients/:clientId/invoices', requireAuth, async (req, res) => {
  try {
    const skip = parseInt(req.query.skip) || 0;
    const take = parseInt(req.query.take) || 10;

    const invoices = await billingService.listInvoices(req.params.clientId, skip, take);
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const invoice = await billingService.getInvoice(req.params.id);
    res.json(invoice);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

// ======================================
// BILLING SETUP
// ======================================

router.post('/clients/:clientId/setup-billing', requireAuth, async (req, res) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ error: 'Missing plan_id' });
    }

    const existingCredits = await billingService.getClientCredits(req.params.clientId);
    if (existingCredits) {
      return res.status(400).json({ error: 'Client already has an active billing plan' });
    }

    const credits = await billingService.createClientCredits(req.params.clientId, plan_id);
    res.status(201).json(credits);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
