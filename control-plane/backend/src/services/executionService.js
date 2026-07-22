const { pool } = require('./database');
const billingService = require('./billingService');
const featuresService = require('./features');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

class ExecutionService {
  async createExecution(executionData) {
    const {
      client_id,
      tenant_id,
      template_id = null,
      titulo,
      descricao = null,
      configuracao_json = {},
    } = executionData;

    const executionId = uuidv4();

    const query = `
      INSERT INTO [dbo].[executions] (
        [id], [client_id], [tenant_id], [template_id], [titulo],
        [descricao], [status], [configuracao_json], [iniciado_em]
      )
      VALUES (
        @executionId, @clientId, @tenantId, @templateId, @titulo,
        @descricao, 'queued', @configuracao, GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('executionId', executionId);
    request.input('clientId', client_id);
    request.input('tenantId', tenant_id);
    request.input('templateId', template_id);
    request.input('titulo', titulo);
    request.input('descricao', descricao);
    request.input('configuracao', JSON.stringify(configuracao_json));

    await request.query(query);

    return this.getExecution(executionId);
  }

  async getExecution(executionId) {
    const query = `
      SELECT * FROM [dbo].[executions] WHERE [id] = @executionId
    `;

    const request = pool.request();
    request.input('executionId', executionId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Execution not found');
    }

    const execution = result.recordset[0];
    if (execution.configuracao_json && typeof execution.configuracao_json === 'string') {
      execution.configuracao_json = JSON.parse(execution.configuracao_json);
    }
    return execution;
  }

  async listClientExecutions(clientId, skip = 0, take = 10) {
    const query = `
      SELECT * FROM [dbo].[executions]
      WHERE [client_id] = @clientId
      ORDER BY [iniciado_em] DESC
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    request.input('skip', skip);
    request.input('take', take);
    const result = await request.query(query);

    const countQuery = `
      SELECT COUNT(*) as total FROM [dbo].[executions]
      WHERE [client_id] = @clientId
    `;
    const countRequest = pool.request();
    countRequest.input('clientId', clientId);
    const countResult = await countRequest.query(countQuery);

    return {
      items: result.recordset,
      total: countResult.recordset[0].total,
      skip,
      take,
    };
  }

  async updateExecutionStatus(executionId, status, metadata = {}) {
    const query = `
      UPDATE [dbo].[executions]
      SET [status] = @status, [finalizado_em] = CASE WHEN @status IN ('completed', 'failed') THEN GETUTCDATE() ELSE [finalizado_em] END
      WHERE [id] = @executionId
    `;

    const request = pool.request();
    request.input('executionId', executionId);
    request.input('status', status);

    await request.query(query);

    logger.info(`Execution ${executionId} status updated to: ${status}`);

    return this.getExecution(executionId);
  }

  async completeExecution(executionId, resultData) {
    try {
      const execution = await this.getExecution(executionId);

      // Calculate credits based on GB processed
      const gbProcessed = resultData.gb_processado || 0;
      const creditsToConsume = Math.ceil(gbProcessed); // 1 credit per GB (can be customized)

      // Save snapshot
      await featuresService.saveExecutionSnapshot(pool, executionId, resultData);

      // Consume credits
      if (creditsToConsume > 0) {
        try {
          await billingService.consumeCredits(
            execution.client_id,
            executionId,
            creditsToConsume
          );
          logger.info(`Consumed ${creditsToConsume} credits for execution ${executionId}`);
        } catch (creditError) {
          logger.warn(`Failed to consume credits for execution ${executionId}: ${creditError.message}`);
          // Continue even if credit consumption fails - the execution should still be marked complete
        }
      }

      // Update execution status
      await this.updateExecutionStatus(executionId, 'completed');

      // Enqueue completion email
      try {
        const client = await pool.request()
          .input('clientId', execution.client_id)
          .query('SELECT * FROM [dbo].[clients] WHERE [id] = @clientId');

        if (client.recordset.length > 0) {
          const clientData = client.recordset[0];
          const emailHtml = `
            <h2>Assessment Concluído</h2>
            <p>Seu assessment foi concluído com sucesso.</p>
            <p><strong>Dados processados:</strong> ${gbProcessed} GB</p>
            <p><strong>Créditos utilizados:</strong> ${creditsToConsume}</p>
          `;

          await featuresService.enqueueEmail(
            pool,
            executionId,
            clientData.email_contato,
            '[CT Assessment] Seu assessment foi concluído',
            emailHtml
          );
        }
      } catch (emailError) {
        logger.warn(`Failed to enqueue completion email: ${emailError.message}`);
      }

      return this.getExecution(executionId);
    } catch (error) {
      logger.error(`Error completing execution: ${error.message}`);
      await this.updateExecutionStatus(executionId, 'failed');
      throw error;
    }
  }

  async failExecution(executionId, errorMessage) {
    try {
      const execution = await this.getExecution(executionId);

      await this.updateExecutionStatus(executionId, 'failed', { error: errorMessage });

      // Enqueue error notification email
      try {
        const client = await pool.request()
          .input('clientId', execution.client_id)
          .query('SELECT * FROM [dbo].[clients] WHERE [id] = @clientId');

        if (client.recordset.length > 0) {
          const clientData = client.recordset[0];
          const emailHtml = `
            <h2>Assessment Falhou</h2>
            <p>Seu assessment encontrou um erro durante a execução.</p>
            <p><strong>Erro:</strong> ${errorMessage}</p>
            <p>Por favor, contate nosso time de suporte.</p>
          `;

          await featuresService.enqueueEmail(
            pool,
            executionId,
            clientData.email_contato,
            '[CT Assessment] Seu assessment falhou',
            emailHtml
          );
        }
      } catch (emailError) {
        logger.warn(`Failed to enqueue error email: ${emailError.message}`);
      }

      return this.getExecution(executionId);
    } catch (error) {
      logger.error(`Error failing execution: ${error.message}`);
      throw error;
    }
  }

  async getExecutionReport(executionId) {
    const execution = await this.getExecution(executionId);

    const query = `
      SELECT TOP 1 * FROM [dbo].[execution_snapshots]
      WHERE [execution_id] = @executionId
      ORDER BY [version_number] DESC
    `;

    const request = pool.request();
    request.input('executionId', executionId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return null;
    }

    const snapshot = result.recordset[0];
    return {
      ...execution,
      report_data: JSON.parse(snapshot.snapshot_data),
      version: snapshot.version_number,
    };
  }
}

module.exports = new ExecutionService();
