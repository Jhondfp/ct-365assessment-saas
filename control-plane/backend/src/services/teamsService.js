const { getTenantConnection } = require('./database');

class TeamsService {
  // Obter análise completa de Teams
  async obterAnaliseTeams(tenantId, filtros = {}) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [team_id], [display_name], [description], [created_date],
          [team_owner], [owner_email], [is_archived], [is_public],
          [member_count], [guest_count], [channel_count], [storage_gb],
          [days_old], [days_inactive], [risk_score], [risk_level],
          [has_retention_policy], [last_activity]
        FROM [dbo].[teams_analysis]
        WHERE 1=1
      `;

      if (filtros.riskLevel) {
        query += ` AND [risk_level] = @riskLevel`;
      }
      if (filtros.isArchived !== undefined) {
        query += ` AND [is_archived] = @isArchived`;
      }
      if (filtros.isPublic !== undefined) {
        query += ` AND [is_public] = @isPublic`;
      }

      query += ` ORDER BY [risk_score] DESC`;

      const request = conn.request();
      if (filtros.riskLevel) request.input('riskLevel', filtros.riskLevel);
      if (filtros.isArchived !== undefined) request.input('isArchived', filtros.isArchived);
      if (filtros.isPublic !== undefined) request.input('isPublic', filtros.isPublic);

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter análise de Teams:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter Teams orfãos (sem proprietário)
  async obterTeamsOrfaos(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT
          [team_id], [display_name], [description], [member_count],
          [guest_count], [channel_count], [storage_gb], [days_old],
          [risk_score], [risk_level]
        FROM [dbo].[teams_analysis]
        WHERE [team_owner] IS NULL
        ORDER BY [risk_score] DESC
      `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter Teams orfãos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter Teams inativos (>180 dias)
  async obterTeamsInativos(tenantId, diasInatividade = 180) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('DiasInatividade', diasInatividade)
        .query(`
          SELECT
            [team_id], [display_name], [team_owner], [owner_email],
            [member_count], [guest_count], [days_inactive], [last_activity],
            [risk_score], [risk_level]
          FROM [dbo].[teams_analysis]
          WHERE [days_inactive] > @DiasInatividade AND [is_archived] = 0
          ORDER BY [days_inactive] DESC
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter Teams inativos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter Teams de alto risco
  async obterTeamsAltoRisco(tenantId, limiteRisco = 50) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('LimiteRisco', limiteRisco)
        .query(`
          SELECT
            [team_id], [display_name], [description], [team_owner],
            [is_public], [member_count], [guest_count], [storage_gb],
            [risk_score], [risk_level]
          FROM [dbo].[teams_analysis]
          WHERE [risk_score] >= @LimiteRisco
          ORDER BY [risk_score] DESC
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter Teams de alto risco:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter detalhes de um Time
  async obterDetalheTime(tenantId, teamId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const resultTime = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT
            [team_id], [display_name], [description], [created_date],
            [team_owner], [owner_email], [is_archived], [is_public],
            [member_count], [guest_count], [channel_count], [storage_gb],
            [days_old], [days_inactive], [risk_score], [risk_level],
            [has_retention_policy], [last_activity]
          FROM [dbo].[teams_analysis]
          WHERE [team_id] = @TeamId
        `);

      if (!resultTime.recordset || resultTime.recordset.length === 0) {
        return {
          sucesso: false,
          erro: 'Time não encontrado',
        };
      }

      const time = resultTime.recordset[0];

      // Obter canais
      const resultCanais = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT [channel_id], [display_name], [channel_type], [has_messages],
            [last_message_date], [days_since_last_message], [member_count]
          FROM [dbo].[teams_channels]
          WHERE [team_id] = @TeamId
          ORDER BY [last_message_date] DESC
        `);

      // Obter membros
      const resultMembros = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT [display_name], [email], [role], [last_activity]
          FROM [dbo].[teams_members]
          WHERE [team_id] = @TeamId
          ORDER BY [role], [display_name]
        `);

      // Obter convidados
      const resultConvidados = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT [display_name], [email], [guest_domain], [added_date]
          FROM [dbo].[teams_guests]
          WHERE [team_id] = @TeamId
        `);

      // Obter recomendações
      const resultRecomendacoes = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT [id], [recommendation_type], [recommendation_text],
            [severity], [status]
          FROM [dbo].[teams_recommendations]
          WHERE [team_id] = @TeamId
          ORDER BY CASE [severity]
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END
        `);

      return {
        sucesso: true,
        dados: {
          time,
          canais: resultCanais.recordset || [],
          membros: resultMembros.recordset || [],
          convidados: resultConvidados.recordset || [],
          recomendacoes: resultRecomendacoes.recordset || [],
        },
      };
    } catch (erro) {
      console.error('Erro ao obter detalhes do Time:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter recomendações de um Time
  async obterRecomendacoesTime(tenantId, teamId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('TeamId', teamId)
        .query(`
          SELECT [id], [recommendation_type], [recommendation_text],
            [severity], [remediation_steps], [status]
          FROM [dbo].[teams_recommendations]
          WHERE [team_id] = @TeamId
          ORDER BY CASE [severity]
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
          END
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter recomendações:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter resumo de Teams (agregações)
  async obterResumoTeams(tenantId, dataResumo = null) {
    const conn = await getTenantConnection(tenantId);
    try {
      let query = `
        SELECT
          [summary_date], [total_teams], [teams_archived], [teams_orphaned],
          [teams_inactive], [teams_public], [teams_high_risk], [total_members],
          [total_guests], [total_channels], [total_storage_gb], [risk_score_avg]
        FROM [dbo].[agg_teams_summary]
      `;

      if (dataResumo) {
        query += ` WHERE [summary_date] = @DataResumo`;
      } else {
        query += ` ORDER BY [summary_date] DESC`;
      }

      const request = conn.request();
      if (dataResumo) request.input('DataResumo', new Date(dataResumo));

      const result = await request.query(query);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter resumo de Teams:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter distribuição de risco
  async obterDistribuicaoRisco(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request().query(`
        SELECT
          [risk_level],
          COUNT(*) as [quantidade],
          AVG(CAST([risk_score] AS DECIMAL(5,2))) as [pontuacao_media],
          SUM([member_count]) as [total_membros],
          SUM([guest_count]) as [total_convidados]
        FROM [dbo].[teams_analysis]
        GROUP BY [risk_level]
        ORDER BY CASE [risk_level]
          WHEN 'Crítico' THEN 1
          WHEN 'Alto' THEN 2
          WHEN 'Médio' THEN 3
          ELSE 4
        END
      `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter distribuição de risco:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Obter canais inativos
  async obterCanaisInativos(tenantId, diasSemAtividade = 90) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('DiasSemAtividade', diasSemAtividade)
        .query(`
          SELECT
            c.[channel_id], c.[team_id], c.[display_name],
            t.[display_name] as [team_name],
            c.[last_message_date], c.[days_since_last_message],
            c.[member_count]
          FROM [dbo].[teams_channels] c
          JOIN [dbo].[teams_analysis] t ON c.[team_id] = t.[team_id]
          WHERE c.[days_since_last_message] > @DiasSemAtividade
          ORDER BY c.[days_since_last_message] DESC
        `);

      return {
        sucesso: true,
        dados: result.recordset || [],
      };
    } catch (erro) {
      console.error('Erro ao obter canais inativos:', erro);
      return {
        sucesso: false,
        erro: erro.message,
      };
    } finally {
      await conn.close();
    }
  }
}

module.exports = new TeamsService();
