const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../config/logger');

// ======================================
// GET /api/dashboard/summary
// Resumo do dashboard para o usuário autenticado
// ======================================
router.get('/summary', async (req, res) => {
  try {
    // TODO: Carregar estatísticas baseado no papel do usuário
    // - SuperAdmin: todos os clientes
    // - Analista: clientes atribuídos
    // - Viewer: read-only, próprio tenant se portal do cliente

    const summary = {
      clientes_totais: 0,
      execucoes_mes_atual: 0,
      custo_mes_atual: 0,
      execucoes_em_progresso: 0,
      alertas_orcamento: []
    };

    res.json(summary);
  } catch (err) {
    logger.error(`Error getting dashboard summary: ${err.message}`);
    res.status(500).json({ error: 'Erro ao carregar resumo' });
  }
});

// ======================================
// GET /api/dashboard/executions
// Histórico de execuções para gráfico de timeline
// ======================================
router.get('/executions', async (req, res) => {
  try {
    // TODO: Retornar execuções filtradas por período/cliente

    res.json({
      data: []
    });
  } catch (err) {
    logger.error(`Error getting dashboard executions: ${err.message}`);
    res.status(500).json({ error: 'Erro ao carregar execuções' });
  }
});

// ======================================
// GET /api/dashboard/finops
// Dados de FinOps - custo por cliente/execução
// ======================================
router.get('/finops', async (req, res) => {
  try {
    // TODO: Retornar custo por GB, por site, por cliente
    // Dados vêm do field tags_finops em executions

    res.json({
      custo_total: 0,
      custo_por_cliente: [],
      custo_por_gb: 0,
      tendencia: 'estável'
    });
  } catch (err) {
    logger.error(`Error getting finops data: ${err.message}`);
    res.status(500).json({ error: 'Erro ao carregar dados de FinOps' });
  }
});

module.exports = router;
