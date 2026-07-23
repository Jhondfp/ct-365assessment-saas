const { getTenantConnection } = require('./database');

class CreditService {
  // Calculate credits needed for an execution based on data size, reports, and alerts
  async calculateExecutionCredits(clientId, executionConfig) {
    const conn = await getTenantConnection(clientId);
    try {
      // executionConfig should have: dataCollectionSizeGb, reportCount, alertCount
      const result = await conn.request()
        .input('DataSizeGb', executionConfig.dataCollectionSizeGb || 0)
        .input('ReportCount', executionConfig.reportCount || 1)
        .input('AlertCount', executionConfig.alertCount || 0)
        .execute('sp_CalculateExecutionCredits');

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error calculating execution credits:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Consume credits from client balance for completed execution
  async consumeCredits(clientId, creditsToConsume, executionId, executionDetails) {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .input('CreditsToConsume', creditsToConsume)
        .input('ExecutionId', executionId)
        .input('ExecutionDetails', JSON.stringify(executionDetails || {}))
        .execute('sp_ConsumeCredits');

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error consuming credits:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Add credits (purchase or refund)
  async addCredits(clientId, creditsToAdd, reason = 'Purchase') {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .input('CreditsToAdd', creditsToAdd)
        .input('Reason', reason)
        .execute('sp_AddCredits');

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error adding credits:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get current credit balance and usage analytics
  async getCreditBalance(clientId) {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .execute('sp_GetCreditUsageAnalytics');

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error getting credit balance:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get credit transaction history
  async getCreditLedger(clientId, limit = 50, offset = 0) {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .input('Limit', limit)
        .input('Offset', offset)
        .execute('sp_GetCreditLedger');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting credit ledger:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get active credit alerts
  async getActiveAlerts(clientId) {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .execute('sp_GetCreditAlerts');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting credit alerts:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get execution-specific credit details
  async getExecutionCreditDetails(clientId, executionId) {
    const conn = await getTenantConnection(clientId);
    try {
      const result = await conn.request()
        .input('ExecutionId', executionId)
        .query(`
          SELECT
            [execution_id],
            [total_credits_consumed],
            [data_collection_credits],
            [storage_credits],
            [report_credits],
            [alert_credits],
            [consumed_at],
            [data_size_gb],
            [report_count],
            [alert_count]
          FROM [dbo].[execution_credit_details]
          WHERE [execution_id] = @ExecutionId
        `);

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error getting execution credit details:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }
}

module.exports = new CreditService();
