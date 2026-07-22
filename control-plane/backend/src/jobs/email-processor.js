const sql = require('mssql');
const logger = require('../config/logger');
const { getConnection } = require('../services/database');
const featuresService = require('../services/features');
const emailService = require('../services/email');
const config = require('../config');

// Processor de fila de emails
const processEmailQueue = async () => {
  const pool = await getConnection();

  try {
    logger.info('Starting email queue processor...');

    const pendingEmails = await featuresService.getEmailQueuePending(pool, 50);

    if (pendingEmails.length === 0) {
      logger.info('No pending emails to process');
      return { processed: 0, successful: 0, failed: 0 };
    }

    let successful = 0;
    let failed = 0;

    for (const emailRecord of pendingEmails) {
      try {
        logger.info(`Processing email: ${emailRecord.id}`);

        // Enviar email
        await emailService.sendCustomEmail(
          emailRecord.recipient_email,
          emailRecord.assunto,
          emailRecord.corpo_html
        );

        // Marcar como enviado
        await featuresService.markEmailSent(pool, emailRecord.id);
        successful++;
      } catch (error) {
        logger.error(`Failed to send email ${emailRecord.id}: ${error.message}`);

        // Marcar como falha
        const canRetry = (emailRecord.tentativas || 0) < (emailRecord.max_tentativas || 5);
        await featuresService.markEmailFailed(pool, emailRecord.id, error.message, canRetry);
        failed++;
      }
    }

    const result = { processed: pendingEmails.length, successful, failed };
    logger.info(`Email queue processing complete: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    logger.error(`Email queue processor error: ${error.message}`);
    throw error;
  }
};

// Cleanup de emails antigos
const cleanupEmailQueue = async () => {
  const pool = await getConnection();

  try {
    logger.info('Starting email queue cleanup...');

    // Manter últimos 90 dias
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);

    const result = await pool
      .request()
      .input('cutoffDate', sql.DateTime2, cutoffDate)
      .query(
        `DELETE FROM [dbo].[email_queue]
         WHERE [criado_em] < @cutoffDate AND [status] IN ('sent', 'bounced')`
      );

    logger.info(`Email queue cleanup complete. Deleted: ${result.rowsAffected[0]} rows`);
  } catch (error) {
    logger.error(`Email queue cleanup error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  processEmailQueue,
  cleanupEmailQueue,

  // Para executar como standalone job
  async run() {
    try {
      await processEmailQueue();
      await cleanupEmailQueue();
      process.exit(0);
    } catch (error) {
      logger.error(`Job failed: ${error.message}`);
      process.exit(1);
    }
  }
};

// Se executado diretamente
if (require.main === module) {
  module.exports.run();
}
