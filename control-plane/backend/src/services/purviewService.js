const { getTenantConnection } = require('./database');

class PurviewService {
  // Obter resumo de Data Map
  async obterResumoDataMap(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT TOP 1
          [total_scanned_items], [classified_items], [unclassified_items],
          [classification_coverage], [sensitive_items_count], [scan_start_date],
          [scan_end_date], [status]
        FROM [dbo].[purview_data_map]
        ORDER BY [coletado_em] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter resumo de Data Map:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter tipos de dados sensíveis
  async obterTiposDadosSensiveis(tenantId, filtros = {}) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [data_type_name], [data_type_category], [count], [severity], [is_sensitive]
        FROM [dbo].[purview_sensitive_data_types]
        WHERE 1=1
      `;

      if (filtros.severidade) {
        query += ` AND [severity] = @Severidade`;
      }

      query += ` ORDER BY [count] DESC`;

      const request = conn.request();
      if (filtros.severidade) request.input('Severidade', filtros.severidade);

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter tipos de dados sensíveis:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter localizações de dados sensíveis
  async obterLocalizacoesSensíveis(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT
          [location], COUNT(*) as [tipos_encontrados],
          SUM([item_count]) as [total_itens]
        FROM [dbo].[purview_data_locations]
        GROUP BY [location]
        ORDER BY [total_itens] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter localizações sensíveis:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter políticas DLP
  async obterPoliticasDLP(tenantId, filtros = {}) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [policy_id], [policy_name], [description], [status],
          [severity], [created_date], [policy_rules_count],
          [last_triggered]
        FROM [dbo].[purview_dlp_policies]
        WHERE 1=1
      `;

      if (filtros.status) {
        query += ` AND [status] = @Status`;
      }
      if (filtros.severidade) {
        query += ` AND [severity] = @Severidade`;
      }

      query += ` ORDER BY [created_date] DESC`;

      const request = conn.request();
      if (filtros.status) request.input('Status', filtros.status);
      if (filtros.severidade) request.input('Severidade', filtros.severidade);

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter políticas DLP:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter violações DLP
  async obterViolacoesDLP(tenantId, diasRetorno = 30, filtros = {}) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [violation_id], [policy_name], [detected_date], [severity],
          [location], [user_email], [action_taken], [sensitive_info_found],
          [item_count], [is_resolved]
        FROM [dbo].[purview_dlp_violations]
        WHERE [detected_date] >= DATEADD(DAY, -@DiasRetorno, GETUTCDATE())
      `;

      if (filtros.severidade) {
        query += ` AND [severity] = @Severidade`;
      }
      if (filtros.resolvida !== undefined) {
        query += ` AND [is_resolved] = @Resolvida`;
      }

      query += ` ORDER BY [detected_date] DESC`;

      const request = conn.request()
        .input('DiasRetorno', diasRetorno);

      if (filtros.severidade) request.input('Severidade', filtros.severidade);
      if (filtros.resolvida !== undefined) request.input('Resolvida', filtros.resolvida);

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter violações DLP:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter resumo de violações DLP
  async obterResumoViolacoesDLP(tenantId, diasRetorno = 30) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('DiasRetorno', diasRetorno)
        .query(`
          SELECT
            [severity], COUNT(*) as [quantidade]
          FROM [dbo].[purview_dlp_violations]
          WHERE [detected_date] >= DATEADD(DAY, -@DiasRetorno, GETUTCDATE())
          GROUP BY [severity]
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter resumo de violações:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter conformidade por framework
  async obterFrameworksConformidade(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT
          [framework_name], [compliance_status], [compliance_score],
          [total_controls], [compliant_controls], [findings_count],
          [critical_findings], [high_findings], [last_assessment_date]
        FROM [dbo].[purview_compliance_frameworks]
        ORDER BY [compliance_score] ASC
      `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter frameworks de conformidade:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter postura de conformidade geral
  async obterPosturaConformidade(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT TOP 1
          [overall_score], [data_classification_score], [dlp_policies_score],
          [retention_policies_score], [compliant_frameworks],
          [partially_compliant_frameworks], [non_compliant_frameworks],
          [total_findings], [critical_findings], [high_findings]
        FROM [dbo].[purview_compliance_posture]
        ORDER BY [posture_date] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter postura de conformidade:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter avaliação de risco de dados
  async obterAvaliacaoRiscoDados(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT TOP 1
          [assessment_date], [risk_score], [risk_level], [sensitive_items_count],
          [dlp_violations_count], [unclassified_items_count],
          [exposed_locations_count], [high_risk_data_types_count],
          [recommendations_count]
        FROM [dbo].[purview_data_risk_assessment]
        ORDER BY [assessment_date] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter avaliação de risco:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter recomendações de risco de dados
  async obterRecomendacoesRisco(tenantId, filtros = {}) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [id], [recommendation_text], [category], [priority],
          [estimated_impact], [status], [created_date]
        FROM [dbo].[purview_data_risk_recommendations]
        WHERE 1=1
      `;

      if (filtros.prioridade) {
        query += ` AND [priority] = @Prioridade`;
      }
      if (filtros.status) {
        query += ` AND [status] = @Status`;
      }

      query += ` ORDER BY CASE [priority]
        WHEN 'Critical' THEN 1
        WHEN 'High' THEN 2
        WHEN 'Medium' THEN 3
        ELSE 4
      END, [created_date] DESC`;

      const request = conn.request();
      if (filtros.prioridade) request.input('Prioridade', filtros.prioridade);
      if (filtros.status) request.input('Status', filtros.status);

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter recomendações de risco:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter resumo agregado de Purview
  async obterResumoAgregado(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT TOP 1
          [summary_date], [total_sensitive_items], [classification_coverage],
          [active_dlp_policies], [dlp_violations_last_7days],
          [dlp_violations_last_30days], [compliance_score],
          [compliant_frameworks], [data_risk_score]
        FROM [dbo].[agg_purview_summary]
        ORDER BY [summary_date] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset[0] || {},
      };
    } catch (erro) {
      console.error('Erro ao obter resumo agregado:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter histórico de conformidade (últimos 30 dias)
  async obterHistoricoConformidade(tenantId, diasRetorno = 30) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('DiasRetorno', diasRetorno)
        .query(`
          SELECT
            [posture_date], [overall_score], [data_classification_score],
            [dlp_policies_score], [compliance_score]
          FROM [dbo].[purview_compliance_posture]
          WHERE [posture_date] >= DATEADD(DAY, -@DiasRetorno, GETUTCDATE())
          ORDER BY [posture_date] ASC
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter histórico de conformidade:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter histórico de risco de dados (últimos 30 dias)
  async obterHistoricoRiscoDados(tenantId, diasRetorno = 30) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('DiasRetorno', diasRetorno)
        .query(`
          SELECT
            [assessment_date], [risk_score], [risk_level],
            [sensitive_items_count], [dlp_violations_count]
          FROM [dbo].[purview_data_risk_assessment]
          WHERE [assessment_date] >= DATEADD(DAY, -@DiasRetorno, GETUTCDATE())
          ORDER BY [assessment_date] ASC
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter histórico de risco:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Marcar recomendação como resolvida
  async marcarRecomendacaoResolvida(tenantId, recomendacaoId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('RecomendacaoId', recomendacaoId)
        .query(`
          UPDATE [dbo].[purview_data_risk_recommendations]
          SET [status] = 'Resolved', [resolved_date] = GETUTCDATE()
          WHERE [id] = @RecomendacaoId
        `);

      return {
        sucesso: true,
        mensagem: 'Recomendação marcada como resolvida',
      };
    } catch (erro) {
      console.error('Erro ao marcar recomendação:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }
}

module.exports = new PurviewService();
