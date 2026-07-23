const { getTenantConnection } = require('./database');

class ServicoCreditos {
  // Calcula créditos necessários para uma execução baseado em tamanho de dados, relatórios e alertas
  async calcularCreditosExecucao(idCliente, configExecucao) {
    const conn = await getTenantConnection(idCliente);
    try {
      // configExecucao deve conter: tamanhoColecaoDadosGb, contaRelatorios, contaAlertas
      const result = await conn.request()
        .input('DataSizeGb', configExecucao.tamanhoColecaoDadosGb || 0)
        .input('ReportCount', configExecucao.contaRelatorios || 1)
        .input('AlertCount', configExecucao.contaAlertas || 0)
        .execute('sp_CalculateExecutionCredits');

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao calcular créditos da execução:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Consome créditos do saldo do cliente para execução concluída
  async consumirCreditos(idCliente, creditosConsumidos, idExecucao, detalhesExecucao) {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .input('CreditsToConsume', creditosConsumidos)
        .input('ExecutionId', idExecucao)
        .input('ExecutionDetails', JSON.stringify(detalhesExecucao || {}))
        .execute('sp_ConsumeCredits');

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao consumir créditos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Adiciona créditos (compra ou reembolso)
  async adicionarCreditos(idCliente, creditosAdicionados, motivo = 'Compra') {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .input('CreditsToAdd', creditosAdicionados)
        .input('Reason', motivo)
        .execute('sp_AddCredits');

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao adicionar créditos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obtém saldo de créditos atual e análise de uso
  async obterSaldoCreditos(idCliente) {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .execute('sp_GetCreditUsageAnalytics');

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter saldo de créditos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obtém histórico de transações de créditos
  async obterLivroCreditoMovimentacoes(idCliente, limite = 50, offset = 0) {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .input('Limit', limite)
        .input('Offset', offset)
        .execute('sp_GetCreditLedger');

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter livro de movimentações:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obtém alertas ativos de créditos
  async obterAlertasAtivos(idCliente) {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .execute('sp_GetCreditAlerts');

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter alertas de créditos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obtém detalhes de créditos específicos da execução
  async obterDetalheCreditosExecucao(idCliente, idExecucao) {
    const conn = await getTenantConnection(idCliente);
    try {
      const result = await conn.request()
        .input('ExecutionId', idExecucao)
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
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter detalhes de créditos da execução:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }
}

module.exports = new ServicoCreditos();
