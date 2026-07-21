const express = require('express');
const router = express.Router();
const db = require('../services/database');
const logger = require('../config/logger');
const { requireRole } = require('../middleware/passport');

// ======================================
// GET /api/executions/:executionId
// Obter detalhes de uma execução
// ======================================
router.get('/:executionId', async (req, res) => {
  try {
    const { executionId } = req.params;
    const execution = await db.getExecutionById(executionId);

    if (!execution) {
      return res.status(404).json({ error: 'Execução não encontrada' });
    }

    res.json(execution);
  } catch (err) {
    logger.error(`Error getting execution: ${err.message}`);
    res.status(500).json({ error: 'Erro ao obter execução' });
  }
});

// ======================================
// POST /api/executions
// Disparar nova execução para um tenant
// ======================================
router.post('/', requireRole(['superadmin', 'analista']), async (req, res) => {
  try {
    const { tenant_id, client_id } = req.body;

    if (!tenant_id || !client_id) {
      return res.status(400).json({ error: 'tenant_id e client_id são obrigatórios' });
    }

    // TODO: Validar acesso do usuário a este client_id

    // TODO: Criar execução no banco
    // TODO: Enfileirar job (adicionar à job_queue)
    // TODO: Enviar evento para orquestrador

    logger.info(`✓ Execução disparada para tenant: ${tenant_id}`);
    res.status(202).json({
      message: 'Execução enfileirada',
      status: 'queued',
      tenant_id
    });
  } catch (err) {
    logger.error(`Error starting execution: ${err.message}`);
    res.status(500).json({ error: 'Erro ao disparar execução' });
  }
});

module.exports = router;
