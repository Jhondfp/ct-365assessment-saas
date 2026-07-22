const express = require('express');
const router = express.Router();
const { getConnection } = require('../services/database');
const featuresService = require('../services/features');
const logger = require('../config/logger');

// ======================================
// EXECUTION SNAPSHOTS & HISTORY
// ======================================

// GET /api/executions/:id/versions
router.get('/executions/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    const versions = await featuresService.getExecutionVersions(pool, id);

    res.json({
      success: true,
      data: versions
    });
  } catch (error) {
    logger.error(`Error getting execution versions: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter histórico de versões'
    });
  }
});

// GET /api/executions/:id/versions/:version
router.get('/executions/:id/versions/:version', async (req, res) => {
  try {
    const { id, version } = req.params;
    const pool = await getConnection();

    const snapshot = await featuresService.getExecutionSnapshot(pool, id, parseInt(version));

    if (!snapshot) {
      return res.status(404).json({
        success: false,
        error: 'Versão não encontrada'
      });
    }

    res.json({
      success: true,
      data: snapshot
    });
  } catch (error) {
    logger.error(`Error getting execution snapshot: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter snapshot'
    });
  }
});

// GET /api/executions/:id/diff
router.get('/executions/:id/diff', async (req, res) => {
  try {
    const { id } = req.params;
    const { v1, v2 } = req.query;

    if (!v1 || !v2) {
      return res.status(400).json({
        success: false,
        error: 'Parâmetros v1 e v2 (versões) são obrigatórios'
      });
    }

    const pool = await getConnection();
    const comparison = await featuresService.compareExecutionSnapshots(
      pool,
      id,
      parseInt(v1),
      parseInt(v2)
    );

    if (!comparison) {
      return res.status(404).json({
        success: false,
        error: 'Versões não encontradas'
      });
    }

    // Calcular delta simples
    const delta = {
      v1_version: comparison.v1,
      v2_version: comparison.v2,
      v1_created: comparison.created_v1,
      v2_created: comparison.created_v2,
      findings_added: [],
      findings_removed: [],
      findings_changed: []
    };

    // Comparar findings
    if (comparison.data_v1.findings_json && comparison.data_v2.findings_json) {
      const f1 = comparison.data_v1.findings_json;
      const f2 = comparison.data_v2.findings_json;

      // Simplificado - apenas contar adições/remoções
      if (Array.isArray(f1) && Array.isArray(f2)) {
        delta.findings_count_v1 = f1.length;
        delta.findings_count_v2 = f2.length;
      }
    }

    res.json({
      success: true,
      data: delta
    });
  } catch (error) {
    logger.error(`Error comparing snapshots: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao comparar versões'
    });
  }
});

// ======================================
// PDF REPORTS
// ======================================

// GET /api/executions/:id/report/pdf
router.get('/executions/:id/report/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    // Buscar PDF existente do cache
    const pdfReport = await featuresService.getPdfReport(pool, id);

    if (pdfReport) {
      return res.json({
        success: true,
        data: {
          url: pdfReport.blob_url,
          sas_token: pdfReport.blob_sas_token,
          size_bytes: pdfReport.tamanho_bytes,
          created_at: pdfReport.criado_em,
          expires_at: pdfReport.expira_em
        }
      });
    }

    // TODO: Implementar geração real de PDF
    // Será feito em outro serviço (pdf-generator.js)
    res.status(202).json({
      success: true,
      message: 'PDF geração iniciada',
      status: 'generating'
    });
  } catch (error) {
    logger.error(`Error getting PDF report: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao obter relatório PDF'
    });
  }
});

// ======================================
// EXECUTION TEMPLATES
// ======================================

// POST /api/execution-templates
router.post('/execution-templates', async (req, res) => {
  try {
    const { tenant_id, template_name, description, config } = req.body;
    const userId = req.user?.id;

    if (!tenant_id || !template_name || !config) {
      return res.status(400).json({
        success: false,
        error: 'tenant_id, template_name e config são obrigatórios'
      });
    }

    const pool = await getConnection();
    const template = await featuresService.createExecutionTemplate(
      pool,
      tenant_id,
      template_name,
      config,
      userId,
      description
    );

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error(`Error creating execution template: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar template'
    });
  }
});

// GET /api/execution-templates/:tenantId
router.get('/execution-templates/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const pool = await getConnection();

    const templates = await featuresService.getExecutionTemplates(pool, tenantId);

    res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    logger.error(`Error getting execution templates: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar templates'
    });
  }
});

// PUT /api/execution-templates/:id
router.put('/execution-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const pool = await getConnection();
    await featuresService.updateExecutionTemplate(pool, id, updates);

    // Retornar template atualizado
    const template = await featuresService.getExecutionTemplate(pool, id);

    res.json({
      success: true,
      data: template
    });
  } catch (error) {
    logger.error(`Error updating execution template: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao atualizar template'
    });
  }
});

// DELETE /api/execution-templates/:id
router.delete('/execution-templates/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getConnection();

    await featuresService.deleteExecutionTemplate(pool, id);

    res.json({
      success: true,
      message: 'Template deletado'
    });
  } catch (error) {
    logger.error(`Error deleting execution template: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao deletar template'
    });
  }
});

// ======================================
// EMAIL QUEUE (Admin only)
// ======================================

// GET /api/admin/email-queue (status da fila)
router.get('/admin/email-queue', async (req, res) => {
  try {
    // TODO: Verificar se user é admin
    const pool = await getConnection();

    const pending = await featuresService.getEmailQueuePending(pool, 50);

    res.json({
      success: true,
      data: {
        pending_count: pending.length,
        items: pending
      }
    });
  } catch (error) {
    logger.error(`Error getting email queue: ${error.message}`);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar fila de emails'
    });
  }
});

module.exports = router;
