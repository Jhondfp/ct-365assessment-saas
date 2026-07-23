const express = require('express');
const router = express.Router();
const servicoFaturamento = require('../services/billingService');
const servicoCreditos = require('../services/creditService');
const servicoCliente = require('../services/clientService');
const { requireAuth } = require('../middleware/auth');

// ======================================
// PLANOS DE CRÉDITOS
// ======================================

router.get('/credit-plans', async (req, res) => {
  try {
    const planos = await servicoFaturamento.getCreditPlans();
    res.json(planos);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ======================================
// FATURAMENTO DO CLIENTE
// ======================================

router.post('/clients/:clientId/credits/purchase', requireAuth, async (req, res) => {
  try {
    const { quantity, payment_method = 'credit_card' } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ erro: 'Quantidade inválida' });
    }

    const transacao = await servicoFaturamento.purchaseCredits(req.params.clientId, quantity, {
      payment_method,
      purchased_by: req.user.id,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json(transacao);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.get('/clients/:clientId/credits', requireAuth, async (req, res) => {
  try {
    const creditos = await servicoFaturamento.getClientCredits(req.params.clientId);
    if (!creditos) {
      return res.status(404).json({ erro: 'Nenhum plano de créditos encontrado para este cliente' });
    }
    res.json(creditos);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.get('/clients/:clientId/credits/transactions', requireAuth, async (req, res) => {
  try {
    const pular = parseInt(req.query.skip) || 0;
    const pegar = parseInt(req.query.take) || 20;

    const transacoes = await servicoFaturamento.getCreditTransactionHistory(req.params.clientId, pular, pegar);
    res.json(transacoes);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.get('/clients/:clientId/billing/dashboard', requireAuth, async (req, res) => {
  try {
    const painel = await servicoFaturamento.getBillingDashboard(req.params.clientId);
    if (!painel) {
      return res.status(404).json({ erro: 'Nenhum plano de créditos encontrado para este cliente' });
    }
    res.json(painel);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.get('/clients/:clientId/invoices', requireAuth, async (req, res) => {
  try {
    const pular = parseInt(req.query.skip) || 0;
    const pegar = parseInt(req.query.take) || 10;

    const faturas = await servicoFaturamento.listInvoices(req.params.clientId, pular, pegar);
    res.json(faturas);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

router.get('/invoices/:id', requireAuth, async (req, res) => {
  try {
    const fatura = await servicoFaturamento.getInvoice(req.params.id);
    res.json(fatura);
  } catch (erro) {
    res.status(404).json({ erro: erro.message });
  }
});

// ======================================
// CONFIGURAÇÃO DE FATURAMENTO
// ======================================

router.post('/clients/:clientId/setup-billing', requireAuth, async (req, res) => {
  try {
    const { plan_id } = req.body;

    if (!plan_id) {
      return res.status(400).json({ erro: 'ID do plano é obrigatório' });
    }

    const creditosExistentes = await servicoFaturamento.getClientCredits(req.params.clientId);
    if (creditosExistentes) {
      return res.status(400).json({ erro: 'Cliente já possui um plano de faturamento ativo' });
    }

    const creditos = await servicoFaturamento.createClientCredits(req.params.clientId, plan_id);
    res.status(201).json(creditos);
  } catch (erro) {
    res.status(500).json({ erro: erro.message });
  }
});

// ======================================
// CONSUMO & ANÁLISE DE CRÉDITOS
// ======================================

router.get('/clients/:clientId/credits/balance', requireAuth, async (req, res) => {
  try {
    const resultado = await servicoCreditos.obterSaldoCreditos(req.params.clientId);
    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.get('/clients/:clientId/credits/ledger', requireAuth, async (req, res) => {
  try {
    const limite = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const resultado = await servicoCreditos.obterLivroCreditoMovimentacoes(req.params.clientId, limite, offset);
    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.get('/clients/:clientId/credits/alerts', requireAuth, async (req, res) => {
  try {
    const resultado = await servicoCreditos.obterAlertasAtivos(req.params.clientId);
    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.get('/clients/:clientId/executions/:executionId/credits', requireAuth, async (req, res) => {
  try {
    const resultado = await servicoCreditos.obterDetalheCreditosExecucao(
      req.params.clientId,
      req.params.executionId
    );
    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.post('/clients/:clientId/credits/calculate', requireAuth, async (req, res) => {
  try {
    const { tamanhoColecaoDadosGb, contaRelatorios, contaAlertas } = req.body;

    const resultado = await servicoCreditos.calcularCreditosExecucao(req.params.clientId, {
      tamanhoColecaoDadosGb: tamanhoColecaoDadosGb || 0,
      contaRelatorios: contaRelatorios || 1,
      contaAlertas: contaAlertas || 0,
    });

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.post('/clients/:clientId/credits/consume', requireAuth, async (req, res) => {
  try {
    const { creditosConsumidos, idExecucao, detalhesExecucao } = req.body;

    if (!creditosConsumidos || creditosConsumidos <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Valor de créditos inválido',
      });
    }

    const resultado = await servicoCreditos.consumirCreditos(
      req.params.clientId,
      creditosConsumidos,
      idExecucao,
      detalhesExecucao
    );

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

router.post('/clients/:clientId/credits/add', requireAuth, async (req, res) => {
  try {
    const { creditosAdicionados, motivo } = req.body;

    if (!creditosAdicionados || creditosAdicionados <= 0) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Valor de créditos inválido',
      });
    }

    const resultado = await servicoCreditos.adicionarCreditos(
      req.params.clientId,
      creditosAdicionados,
      motivo || 'Adição Manual'
    );

    if (resultado.sucesso) {
      res.json({
        sucesso: true,
        dados: resultado.dados,
      });
    } else {
      res.status(500).json({
        sucesso: false,
        erro: resultado.erro,
      });
    }
  } catch (erro) {
    res.status(500).json({
      sucesso: false,
      erro: erro.message,
    });
  }
});

module.exports = router;
