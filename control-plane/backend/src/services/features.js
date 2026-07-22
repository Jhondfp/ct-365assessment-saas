const sql = require('mssql');
const logger = require('../config/logger');

// ======================================
// EXECUTION SNAPSHOTS - Histórico
// ======================================

const saveExecutionSnapshot = async (pool, executionId, snapshotData) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .input('snapshotData', sql.NVarChar(sql.MAX), JSON.stringify(snapshotData))
      .execute('sp_SaveExecutionSnapshot');

    logger.info(`Snapshot saved for execution: ${executionId}`);
    return result.recordset[0];
  } catch (err) {
    logger.error(`Error saving execution snapshot: ${err.message}`);
    throw err;
  }
};

const getExecutionVersions = async (pool, executionId) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .query(
        `SELECT [version_number], [criado_em]
         FROM [dbo].[execution_snapshots]
         WHERE [execution_id] = @executionId
         ORDER BY [version_number] DESC`
      );
    return result.recordset;
  } catch (err) {
    logger.error(`Error getting execution versions: ${err.message}`);
    throw err;
  }
};

const getExecutionSnapshot = async (pool, executionId, versionNumber) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .input('versionNumber', sql.Int, versionNumber)
      .query(
        `SELECT [version_number], [snapshot_data], [criado_em]
         FROM [dbo].[execution_snapshots]
         WHERE [execution_id] = @executionId AND [version_number] = @versionNumber`
      );

    const snapshot = result.recordset[0];
    if (snapshot) {
      snapshot.snapshot_data = JSON.parse(snapshot.snapshot_data);
    }
    return snapshot;
  } catch (err) {
    logger.error(`Error getting execution snapshot: ${err.message}`);
    throw err;
  }
};

const compareExecutionSnapshots = async (pool, executionId, version1, version2) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .input('version1', sql.Int, version1)
      .input('version2', sql.Int, version2)
      .execute('sp_CompareSnapshots');

    const row = result.recordset[0];
    if (row) {
      row.data_v1 = JSON.parse(row.data_v1);
      row.data_v2 = JSON.parse(row.data_v2);
    }
    return row;
  } catch (err) {
    logger.error(`Error comparing snapshots: ${err.message}`);
    throw err;
  }
};

// ======================================
// EMAIL QUEUE
// ======================================

const enqueueEmail = async (pool, executionId, recipientEmail, subject, htmlBody) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .input('recipientEmail', sql.NVarChar(255), recipientEmail)
      .input('assunto', sql.NVarChar(255), subject)
      .input('corpoHtml', sql.NVarChar(sql.MAX), htmlBody)
      .execute('sp_EnqueueEmail');

    logger.info(`Email enqueued: ${recipientEmail}`);
    return result.recordset[0];
  } catch (err) {
    logger.error(`Error enqueueing email: ${err.message}`);
    throw err;
  }
};

const getEmailQueuePending = async (pool, limit = 50) => {
  try {
    const result = await pool
      .request()
      .input('limit', sql.Int, limit)
      .query(
        `SELECT TOP (@limit) * FROM [dbo].[email_queue]
         WHERE [status] = 'pending'
         ORDER BY [criado_em] ASC`
      );
    return result.recordset;
  } catch (err) {
    logger.error(`Error getting pending emails: ${err.message}`);
    throw err;
  }
};

const markEmailSent = async (pool, emailQueueId, sentAt = new Date()) => {
  try {
    await pool
      .request()
      .input('emailQueueId', sql.UniqueIdentifier, emailQueueId)
      .input('sentAt', sql.DateTime2, sentAt)
      .query(
        `UPDATE [dbo].[email_queue]
         SET [status] = 'sent', [enviado_em] = @sentAt
         WHERE [id] = @emailQueueId`
      );

    logger.info(`Email marked as sent: ${emailQueueId}`);
  } catch (err) {
    logger.error(`Error marking email sent: ${err.message}`);
    throw err;
  }
};

const markEmailFailed = async (pool, emailQueueId, errorMessage, retry = true) => {
  try {
    const nextAttempt = retry ? new Date(Date.now() + 300000) : null; // 5 min retry

    await pool
      .request()
      .input('emailQueueId', sql.UniqueIdentifier, emailQueueId)
      .input('status', sql.VarChar(20), retry ? 'retrying' : 'failed')
      .input('errorMessage', sql.NVarChar(sql.MAX), errorMessage)
      .input('nextAttempt', sql.DateTime2, nextAttempt)
      .query(
        `UPDATE [dbo].[email_queue]
         SET [status] = @status, [mensagem_erro] = @errorMessage,
             [tentativas] = [tentativas] + 1, [proxima_tentativa_em] = @nextAttempt
         WHERE [id] = @emailQueueId`
      );

    logger.warn(`Email marked as failed: ${emailQueueId} - ${errorMessage}`);
  } catch (err) {
    logger.error(`Error marking email failed: ${err.message}`);
    throw err;
  }
};

// ======================================
// PDF REPORTS
// ======================================

const registerPdfReport = async (pool, executionId, blobUrl, blobSasToken, sizeBytes, md5Hash, expiresAt) => {
  try {
    await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .input('blobUrl', sql.NVarChar(sql.MAX), blobUrl)
      .input('blobSasToken', sql.NVarChar(sql.MAX), blobSasToken)
      .input('tamanhoBytes', sql.BigInt, sizeBytes)
      .input('hashMd5', sql.VarChar(32), md5Hash)
      .input('expiresAt', sql.DateTime2, expiresAt)
      .execute('sp_RegisterPdfReport');

    logger.info(`PDF report registered for execution: ${executionId}`);
  } catch (err) {
    logger.error(`Error registering PDF report: ${err.message}`);
    throw err;
  }
};

const getPdfReport = async (pool, executionId) => {
  try {
    const result = await pool
      .request()
      .input('executionId', sql.UniqueIdentifier, executionId)
      .query(
        `SELECT * FROM [dbo].[pdf_reports]
         WHERE [execution_id] = @executionId`
      );
    return result.recordset[0] || null;
  } catch (err) {
    logger.error(`Error getting PDF report: ${err.message}`);
    throw err;
  }
};

// ======================================
// EXECUTION TEMPLATES
// ======================================

const createExecutionTemplate = async (pool, tenantId, templateName, configJson, createdBy, description = null) => {
  try {
    const result = await pool
      .request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .input('templateName', sql.NVarChar(255), templateName)
      .input('descricao', sql.NVarChar(sql.MAX), description)
      .input('configJson', sql.NVarChar(sql.MAX), JSON.stringify(configJson))
      .input('createdBy', sql.UniqueIdentifier, createdBy)
      .query(
        `INSERT INTO [dbo].[execution_templates]
         ([tenant_id], [template_nome], [descricao], [config_json], [criado_por])
         VALUES (@tenantId, @templateName, @descricao, @configJson, @createdBy);
         SELECT * FROM [dbo].[execution_templates]
         WHERE [tenant_id] = @tenantId AND [template_nome] = @templateName`
      );

    logger.info(`Template created: ${templateName}`);
    return result.recordset[0];
  } catch (err) {
    logger.error(`Error creating execution template: ${err.message}`);
    throw err;
  }
};

const getExecutionTemplates = async (pool, tenantId) => {
  try {
    const result = await pool
      .request()
      .input('tenantId', sql.UniqueIdentifier, tenantId)
      .query(
        `SELECT * FROM [dbo].[execution_templates]
         WHERE [tenant_id] = @tenantId AND [ativo] = 1
         ORDER BY [criado_em] DESC`
      );

    return result.recordset.map(t => ({
      ...t,
      config_json: JSON.parse(t.config_json)
    }));
  } catch (err) {
    logger.error(`Error getting execution templates: ${err.message}`);
    throw err;
  }
};

const getExecutionTemplate = async (pool, templateId) => {
  try {
    const result = await pool
      .request()
      .input('templateId', sql.UniqueIdentifier, templateId)
      .query(
        `SELECT * FROM [dbo].[execution_templates]
         WHERE [id] = @templateId AND [ativo] = 1`
      );

    const template = result.recordset[0];
    if (template) {
      template.config_json = JSON.parse(template.config_json);
    }
    return template;
  } catch (err) {
    logger.error(`Error getting execution template: ${err.message}`);
    throw err;
  }
};

const updateExecutionTemplate = async (pool, templateId, updates) => {
  try {
    const setClauses = [];
    const request = pool.request().input('templateId', sql.UniqueIdentifier, templateId);

    if (updates.template_nome) {
      setClauses.push('[template_nome] = @templateName');
      request.input('templateName', sql.NVarChar(255), updates.template_nome);
    }

    if (updates.descricao !== undefined) {
      setClauses.push('[descricao] = @descricao');
      request.input('descricao', sql.NVarChar(sql.MAX), updates.descricao);
    }

    if (updates.config_json) {
      setClauses.push('[config_json] = @configJson');
      request.input('configJson', sql.NVarChar(sql.MAX), JSON.stringify(updates.config_json));
    }

    if (updates.ativo !== undefined) {
      setClauses.push('[ativo] = @ativo');
      request.input('ativo', sql.Bit, updates.ativo ? 1 : 0);
    }

    setClauses.push('[atualizado_em] = GETUTCDATE()');

    const query = `UPDATE [dbo].[execution_templates]
                   SET ${setClauses.join(', ')}
                   WHERE [id] = @templateId`;

    await request.query(query);
    logger.info(`Template updated: ${templateId}`);
  } catch (err) {
    logger.error(`Error updating execution template: ${err.message}`);
    throw err;
  }
};

const deleteExecutionTemplate = async (pool, templateId) => {
  try {
    await pool
      .request()
      .input('templateId', sql.UniqueIdentifier, templateId)
      .query(
        `UPDATE [dbo].[execution_templates]
         SET [ativo] = 0
         WHERE [id] = @templateId`
      );

    logger.info(`Template deleted (soft): ${templateId}`);
  } catch (err) {
    logger.error(`Error deleting execution template: ${err.message}`);
    throw err;
  }
};

// ======================================
// EXECUTION UPDATES
// ======================================

const updateExecutionWithResults = async (pool, executionId, updates) => {
  try {
    const setClauses = [];
    const request = pool.request().input('executionId', sql.UniqueIdentifier, executionId);

    if (updates.status) {
      setClauses.push('[status] = @status');
      request.input('status', sql.VarChar(20), updates.status);
    }

    if (updates.findings_json) {
      setClauses.push('[findings_json] = @findingsJson');
      request.input('findingsJson', sql.NVarChar(sql.MAX), JSON.stringify(updates.findings_json));
    }

    if (updates.gb_processado !== undefined) {
      setClauses.push('[gb_processado] = @gbProcessado');
      request.input('gbProcessado', sql.Decimal(10, 2), updates.gb_processado);
    }

    if (updates.sites_analisados) {
      setClauses.push('[sites_analisados] = @sitesAnalisados');
      request.input('sitesAnalisados', sql.NVarChar(sql.MAX), JSON.stringify(updates.sites_analisados));
    }

    if (updates.custo_real !== undefined) {
      setClauses.push('[custo_real] = @custoReal');
      request.input('custoReal', sql.Decimal(10, 2), updates.custo_real);
    }

    if (updates.tempo_execucao_segundos !== undefined) {
      setClauses.push('[tempo_execucao_segundos] = @tempoExecucao');
      request.input('tempoExecucao', sql.Int, updates.tempo_execucao_segundos);
    }

    if (updates.config_json) {
      setClauses.push('[config_json] = @configJson');
      request.input('configJson', sql.NVarChar(sql.MAX), JSON.stringify(updates.config_json));
    }

    if (updates.mensagem_erro) {
      setClauses.push('[mensagem_erro] = @mensagemErro');
      request.input('mensagemErro', sql.NVarChar(sql.MAX), updates.mensagem_erro);
    }

    if (updates.finalizado_em !== undefined) {
      setClauses.push('[finalizado_em] = @finalizadoEm');
      request.input('finalizadoEm', sql.DateTime2, updates.finalizado_em || new Date());
    }

    if (setClauses.length === 0) return;

    setClauses.push('[atualizado_em] = GETUTCDATE()');

    const query = `UPDATE [dbo].[executions]
                   SET ${setClauses.join(', ')}
                   WHERE [id] = @executionId`;

    await request.query(query);
    logger.info(`Execution updated: ${executionId}`);
  } catch (err) {
    logger.error(`Error updating execution: ${err.message}`);
    throw err;
  }
};

module.exports = {
  // Snapshots
  saveExecutionSnapshot,
  getExecutionVersions,
  getExecutionSnapshot,
  compareExecutionSnapshots,

  // Email Queue
  enqueueEmail,
  getEmailQueuePending,
  markEmailSent,
  markEmailFailed,

  // PDF Reports
  registerPdfReport,
  getPdfReport,

  // Templates
  createExecutionTemplate,
  getExecutionTemplates,
  getExecutionTemplate,
  updateExecutionTemplate,
  deleteExecutionTemplate,

  // Execution Updates
  updateExecutionWithResults
};
