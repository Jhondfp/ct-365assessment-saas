const express = require('express');
const Joi = require('joi');
const router = express.Router();
const db = require('../services/database');
const logger = require('../config/logger');
const { requireRole } = require('../middleware/passport');
const { v4: uuidv4 } = require('uuid');

// Validação de CNPJ simples (não é validação criptográfica, apenas formato)
const isValidCNPJ = (cnpj) => /^\d{14}$/.test(cnpj.replace(/\D/g, ''));

// ======================================
// GET /api/clients
// Listar clientes (com paginação)
// ======================================
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0');
    const limit = parseInt(req.query.limit || '20');

    if (page < 0 || limit < 1 || limit > 100) {
      return res.status(400).json({ error: 'Parâmetros de paginação inválidos' });
    }

    const clients = await db.listClients(page, limit);
    res.json({
      page,
      limit,
      data: clients
    });
  } catch (err) {
    logger.error(`Error listing clients: ${err.message}`);
    res.status(500).json({ error: 'Erro ao listar clientes' });
  }
});

// ======================================
// GET /api/clients/:clientId
// Obter detalhes de um cliente
// ======================================
router.get('/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await db.getClientById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    // Carregar tenants do cliente
    const tenants = await db.listTenantsByClient(clientId);

    res.json({
      ...client,
      tenants
    });
  } catch (err) {
    logger.error(`Error getting client: ${err.message}`);
    res.status(500).json({ error: 'Erro ao obter cliente' });
  }
});

// ======================================
// POST /api/clients
// Criar novo cliente (requer SuperAdmin)
// ======================================
router.post('/', requireRole(['superadmin']), async (req, res) => {
  try {
    const schema = Joi.object({
      razao_social: Joi.string().required().max(255),
      cnpj: Joi.string().required(),
      email_contato: Joi.string().email().required(),
      regiao: Joi.string().default('brazilsouth')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // Validar CNPJ
    if (!isValidCNPJ(value.cnpj)) {
      return res.status(400).json({ error: 'CNPJ inválido' });
    }

    const client = await db.createClient(value);

    // Registrar na auditoria
    await db.logAudit({
      user_id: req.user.id,
      acao: 'create_client',
      alvo_tipo: 'client',
      alvo_id: client.id,
      detalhes_json: { cnpj: value.cnpj, razao_social: value.razao_social },
      endereco_ip: req.ip,
      user_agent: req.get('user-agent')
    });

    logger.info(`✓ Cliente criado: ${value.razao_social} (${value.cnpj})`);
    res.status(201).json(client);
  } catch (err) {
    logger.error(`Error creating client: ${err.message}`);

    // Verificar se é erro de CNPJ duplicado
    if (err.message.includes('duplicate') || err.number === 2601) {
      return res.status(409).json({ error: 'CNPJ já existe' });
    }

    res.status(500).json({ error: 'Erro ao criar cliente' });
  }
});

// ======================================
// PATCH /api/clients/:clientId
// Atualizar cliente (requer SuperAdmin)
// ======================================
router.patch('/:clientId', requireRole(['superadmin']), async (req, res) => {
  try {
    const { clientId } = req.params;
    const client = await db.getClientById(clientId);

    if (!client) {
      return res.status(404).json({ error: 'Cliente não encontrado' });
    }

    // Validação: pode atualizar apenas alguns campos
    const schema = Joi.object({
      razao_social: Joi.string().max(255),
      email_contato: Joi.string().email(),
      status: Joi.string().valid('active', 'suspended', 'terminated')
    });

    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }

    // TODO: Implementar UPDATE no banco
    // Por enquanto, apenas valida

    await db.logAudit({
      user_id: req.user.id,
      acao: 'update_client',
      alvo_tipo: 'client',
      alvo_id: clientId,
      detalhes_json: value,
      endereco_ip: req.ip,
      user_agent: req.get('user-agent')
    });

    res.json({ ...client, ...value });
  } catch (err) {
    logger.error(`Error updating client: ${err.message}`);
    res.status(500).json({ error: 'Erro ao atualizar cliente' });
  }
});

module.exports = router;
