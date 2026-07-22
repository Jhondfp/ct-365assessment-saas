const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');

class BillingService {
  async getCreditPlans() {
    const query = `
      SELECT * FROM [dbo].[credit_plans]
      ORDER BY [creditos_mensais] ASC
    `;

    const result = await pool.request().query(query);
    return result.recordset;
  }

  async getCreditPlan(planId) {
    const query = `
      SELECT * FROM [dbo].[credit_plans] WHERE [id] = @planId
    `;

    const request = pool.request();
    request.input('planId', planId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Credit plan not found');
    }

    return result.recordset[0];
  }

  async getClientCredits(clientId) {
    const query = `
      SELECT
        cc.*,
        cp.[nome] as plan_name,
        cp.[creditos_mensais],
        cp.[preco_mensal_brl],
        cp.[preco_credito_extra_brl]
      FROM [dbo].[client_credits] cc
      LEFT JOIN [dbo].[credit_plans] cp ON cc.[plan_id] = cp.[id]
      WHERE cc.[client_id] = @clientId
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      return null;
    }

    return result.recordset[0];
  }

  async createClientCredits(clientId, planId) {
    const plan = await this.getCreditPlan(planId);
    const creditId = uuidv4();

    const query = `
      INSERT INTO [dbo].[client_credits] (
        [id], [client_id], [plan_id], [creditos_atuais],
        [creditos_consumidos_mes], [data_renovacao]
      )
      VALUES (
        @creditId, @clientId, @planId, @creditosAtuais,
        0, GETUTCDATE()
      )
    `;

    const request = pool.request();
    request.input('creditId', creditId);
    request.input('clientId', clientId);
    request.input('planId', planId);
    request.input('creditosAtuais', plan.creditos_mensais);

    await request.query(query);

    return this.getClientCredits(clientId);
  }

  async purchaseCredits(clientId, quantity, metadata = {}) {
    const credits = await this.getClientCredits(clientId);
    if (!credits) {
      throw new Error('Client has no credit plan');
    }

    const transactionId = uuidv4();
    const novoSaldo = credits.creditos_atuais + quantity;

    const query = `
      BEGIN TRANSACTION;

      INSERT INTO [dbo].[credit_transactions] (
        [id], [client_id], [transaction_type], [quantity],
        [saldo_anterior], [saldo_novo], [metadata], [created_at]
      )
      VALUES (
        @transactionId, @clientId, 'purchase', @quantity,
        @saldoAnterior, @saldoNovo, @metadata, GETUTCDATE()
      );

      UPDATE [dbo].[client_credits]
      SET [creditos_atuais] = @saldoNovo
      WHERE [client_id] = @clientId;

      COMMIT TRANSACTION;
    `;

    const request = pool.request();
    request.input('transactionId', transactionId);
    request.input('clientId', clientId);
    request.input('quantity', quantity);
    request.input('saldoAnterior', credits.creditos_atuais);
    request.input('saldoNovo', novoSaldo);
    request.input('metadata', JSON.stringify(metadata));

    await request.query(query);

    return {
      transaction_id: transactionId,
      client_id: clientId,
      type: 'purchase',
      quantity,
      previous_balance: credits.creditos_atuais,
      new_balance: novoSaldo,
    };
  }

  async consumeCredits(clientId, executionId, creditsToConsume) {
    const credits = await this.getClientCredits(clientId);
    if (!credits) {
      throw new Error('Client has no credit plan');
    }

    if (credits.creditos_atuais < creditsToConsume) {
      throw new Error('Insufficient credits');
    }

    const transactionId = uuidv4();
    const novoSaldo = credits.creditos_atuais - creditsToConsume;

    const query = `
      BEGIN TRANSACTION;

      INSERT INTO [dbo].[credit_transactions] (
        [id], [client_id], [transaction_type], [quantity],
        [saldo_anterior], [saldo_novo], [metadata], [created_at]
      )
      VALUES (
        @transactionId, @clientId, 'consumption', @quantity,
        @saldoAnterior, @saldoNovo, @metadata, GETUTCDATE()
      );

      INSERT INTO [dbo].[consumo_assessments] (
        [id], [client_id], [execution_id], [creditos_consumidos], [created_at]
      )
      VALUES (
        NEWID(), @clientId, @executionId, @quantity, GETUTCDATE()
      );

      UPDATE [dbo].[client_credits]
      SET [creditos_atuais] = @saldoNovo,
          [creditos_consumidos_mes] = [creditos_consumidos_mes] + @quantity
      WHERE [client_id] = @clientId;

      UPDATE [dbo].[executions]
      SET [creditos_utilizados] = @quantity
      WHERE [id] = @executionId;

      COMMIT TRANSACTION;
    `;

    const request = pool.request();
    request.input('transactionId', transactionId);
    request.input('clientId', clientId);
    request.input('executionId', executionId);
    request.input('quantity', creditsToConsume);
    request.input('saldoAnterior', credits.creditos_atuais);
    request.input('saldoNovo', novoSaldo);
    request.input('metadata', JSON.stringify({
      execution_id: executionId,
      reason: 'assessment_completion',
    }));

    await request.query(query);

    return {
      transaction_id: transactionId,
      client_id: clientId,
      execution_id: executionId,
      type: 'consumption',
      quantity: creditsToConsume,
      previous_balance: credits.creditos_atuais,
      new_balance: novoSaldo,
    };
  }

  async getCreditTransactionHistory(clientId, skip = 0, take = 20) {
    const query = `
      SELECT * FROM [dbo].[credit_transactions]
      WHERE [client_id] = @clientId
      ORDER BY [created_at] DESC
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    request.input('skip', skip);
    request.input('take', take);
    const result = await request.query(query);

    return result.recordset.map(record => ({
      ...record,
      metadata: JSON.parse(record.metadata || '{}'),
    }));
  }

  async generateMonthlyInvoice(clientId) {
    const credits = await this.getClientCredits(clientId);
    if (!credits) {
      throw new Error('Client has no credit plan');
    }

    const plan = await this.getCreditPlan(credits.plan_id);
    const invoiceId = uuidv4();

    const consumidoEst = credits.creditos_consumidos_mes;
    const creditsIncludedInPlan = plan.creditos_mensais;
    const creditsOverage = Math.max(0, consumidoEst - creditsIncludedInPlan);
    const costOverage = creditsOverage * plan.preco_credito_extra_brl;
    const totalDue = plan.preco_mensal_brl + costOverage;

    const query = `
      INSERT INTO [dbo].[faturas] (
        [id], [client_id], [numero_fatura], [data_emissao],
        [creditos_consumidos], [creditos_inclusos_plano],
        [creditos_excedentes], [valor_plano_brl],
        [valor_excedentes_brl], [valor_total_brl],
        [status], [created_at]
      )
      VALUES (
        @invoiceId, @clientId, @numeroFatura, GETUTCDATE(),
        @creditosConsumidos, @creditosInclusos, @creditosExcedentes,
        @valorPlano, @valorExcedentes, @valorTotal,
        'pending', GETUTCDATE()
      );

      UPDATE [dbo].[client_credits]
      SET [creditos_consumidos_mes] = 0,
          [data_renovacao] = DATEADD(MONTH, 1, GETUTCDATE())
      WHERE [client_id] = @clientId;
    `;

    const numeroFatura = `CT-${new Date().getFullYear()}-${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${clientId.substring(0, 8).toUpperCase()}`;

    const request = pool.request();
    request.input('invoiceId', invoiceId);
    request.input('clientId', clientId);
    request.input('numeroFatura', numeroFatura);
    request.input('creditosConsumidos', consumidoEst);
    request.input('creditosInclusos', creditsIncludedInPlan);
    request.input('creditosExcedentes', creditsOverage);
    request.input('valorPlano', plan.preco_mensal_brl);
    request.input('valorExcedentes', costOverage);
    request.input('valorTotal', totalDue);

    await request.query(query);

    return {
      id: invoiceId,
      client_id: clientId,
      numero_fatura: numeroFatura,
      creditos_consumidos: consumidoEst,
      creditos_inclusos_plano: creditsIncludedInPlan,
      creditos_excedentes: creditsOverage,
      valor_plano_brl: plan.preco_mensal_brl,
      valor_excedentes_brl: costOverage,
      valor_total_brl: totalDue,
      status: 'pending',
    };
  }

  async listInvoices(clientId, skip = 0, take = 10) {
    const query = `
      SELECT * FROM [dbo].[faturas]
      WHERE [client_id] = @clientId
      ORDER BY [data_emissao] DESC
      OFFSET @skip ROWS
      FETCH NEXT @take ROWS ONLY
    `;

    const request = pool.request();
    request.input('clientId', clientId);
    request.input('skip', skip);
    request.input('take', take);
    const result = await request.query(query);

    return result.recordset;
  }

  async getInvoice(invoiceId) {
    const query = `
      SELECT * FROM [dbo].[faturas] WHERE [id] = @invoiceId
    `;

    const request = pool.request();
    request.input('invoiceId', invoiceId);
    const result = await request.query(query);

    if (result.recordset.length === 0) {
      throw new Error('Invoice not found');
    }

    return result.recordset[0];
  }

  async getBillingDashboard(clientId) {
    const credits = await this.getClientCredits(clientId);
    if (!credits) {
      return null;
    }

    const plan = await this.getCreditPlan(credits.plan_id);

    const recentTransactions = await this.getCreditTransactionHistory(clientId, 0, 5);

    const recentInvoices = await this.listInvoices(clientId, 0, 3);

    return {
      current_credits: credits.creditos_atuais,
      credits_consumed_this_month: credits.creditos_consumidos_mes,
      plan: {
        id: plan.id,
        name: plan.nome,
        monthly_credits: plan.creditos_mensais,
        monthly_price_brl: plan.preco_mensal_brl,
        overage_price_per_credit_brl: plan.preco_credito_extra_brl,
      },
      recent_transactions: recentTransactions,
      recent_invoices: recentInvoices,
    };
  }
}

module.exports = new BillingService();
