const { pool } = require('./database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

class LicenseService {
  async getLicenseDashboard(clientId) {
    try {
      const client = await pool.request()
        .input('clientId', clientId)
        .query('SELECT * FROM [dbo].[clients] WHERE [id] = @clientId');

      if (client.recordset.length === 0) {
        throw new Error('Client not found');
      }

      // Get license summary by SKU
      const summary = await pool.request()
        .query(`
          SELECT
            [sku_id],
            [sku_name],
            [categoria],
            COUNT(DISTINCT [user_id]) as total_usuarios,
            COUNT(*) as total_licencas,
            SUM(CASE WHEN [status] = 'active' THEN 1 ELSE 0 END) as licencas_ativas,
            AVG(CAST([utilizacao_percentual] AS FLOAT)) as utilizacao_media,
            SUM([preco_unitario_brl]) as custo_mensal
          FROM [dbo].[vw_license_summary_by_sku]
          GROUP BY [sku_id], [sku_name], [categoria]
          ORDER BY [custo_mensal] DESC
        `);

      // Get cost analysis
      const costAnalysis = await pool.request()
        .query(`
          SELECT TOP 1 *
          FROM [dbo].[license_costs_analysis]
          ORDER BY [data_analise] DESC
        `);

      // Get recommendations
      const recommendations = await pool.request()
        .query(`
          SELECT TOP 10 *
          FROM [dbo].[license_recommendations]
          WHERE [resolvido] = 0
          ORDER BY [severidade] DESC, [data_criacao] DESC
        `);

      return {
        client: client.recordset[0],
        licenseSummary: summary.recordset,
        costAnalysis: costAnalysis.recordset[0] || null,
        topRecommendations: recommendations.recordset,
      };
    } catch (error) {
      logger.error(`Error getting license dashboard: ${error.message}`);
      throw error;
    }
  }

  async getLicenseSummaryByType(clientId) {
    try {
      const result = await pool.request()
        .query(`
          SELECT
            [sku_id],
            [sku_name],
            [display_name],
            [categoria],
            COUNT(DISTINCT ul.[user_id]) as usuarios_unicos,
            COUNT(ul.[id]) as total_licencas,
            SUM(CASE WHEN ul.[status] = 'active' THEN 1 ELSE 0 END) as ativas,
            SUM(CASE WHEN ul.[status] = 'inactive' THEN 1 ELSE 0 END) as inativas,
            AVG(CAST(lu.[utilizacao_percentual] AS FLOAT)) as utilizacao_media,
            SUM(lp.[preco_unitario_brl]) as custo_mensal_total
          FROM [dbo].[license_plans] lp
          LEFT JOIN [dbo].[user_licenses] ul ON lp.[sku_id] = ul.[sku_id]
          LEFT JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id] AND ul.[sku_id] = lu.[sku_id]
          GROUP BY lp.[sku_id], lp.[sku_name], lp.[display_name], lp.[categoria]
          ORDER BY [custo_mensal_total] DESC
        `);

      return result.recordset;
    } catch (error) {
      logger.error(`Error getting license summary by type: ${error.message}`);
      throw error;
    }
  }

  async getUnusedLicenses(clientId, daysInactive = 30) {
    try {
      const result = await pool.request()
        .input('daysInactive', daysInactive)
        .query(`
          SELECT
            [id],
            [user_email],
            [sku_id],
            [sku_name],
            [data_atribuicao],
            [ultima_atividade],
            [dias_inativo],
            [utilizacao_percentual],
            [preco_unitario_brl],
            CASE
              WHEN [dias_inativo] > 90 THEN 'Critical'
              WHEN [dias_inativo] > 60 THEN 'High'
              WHEN [dias_inativo] > 30 THEN 'Medium'
              ELSE 'Low'
            END as prioridade
          FROM [dbo].[vw_unused_licenses]
          WHERE [dias_inativo] > @daysInactive
          ORDER BY [dias_inativo] DESC
        `);

      return result.recordset;
    } catch (error) {
      logger.error(`Error getting unused licenses: ${error.message}`);
      throw error;
    }
  }

  async getDowngradeOpportunities(clientId) {
    try {
      const result = await pool.request()
        .query(`
          SELECT
            [user_email],
            [sku_id],
            [sku_name],
            [servicos_utilizados],
            [total_servicos_disponiveis],
            [utilizacao_percentual],
            [preco_unitario_brl],
            CAST([preco_unitario_brl] * 0.4 AS DECIMAL(10, 2)) as economia_potencial
          FROM [dbo].[vw_downgrade_opportunities]
          ORDER BY [economia_potencial] DESC
        `);

      return result.recordset;
    } catch (error) {
      logger.error(`Error getting downgrade opportunities: ${error.message}`);
      throw error;
    }
  }

  async getLicenseUtilization(clientId) {
    try {
      const result = await pool.request()
        .query(`
          SELECT
            [user_email],
            [sku_id],
            [ultima_atividade],
            [dias_inativo],
            [utilizacao_percentual],
            [servicos_utilizados],
            [ativo_30_dias],
            [ativo_90_dias],
            [ativo_180_dias],
            [ultima_atualizacao]
          FROM [dbo].[license_utilization]
          ORDER BY [utilizacao_percentual] DESC
        `);

      // Calculate statistics
      const records = result.recordset;
      const stats = {
        totalRecords: records.length,
        averageUtilization: records.reduce((sum, r) => sum + (r.utilizacao_percentual || 0), 0) / records.length,
        activeUsers30Days: records.filter(r => r.ativo_30_dias === 1).length,
        activeUsers90Days: records.filter(r => r.ativo_90_dias === 1).length,
        activeUsers180Days: records.filter(r => r.ativo_180_dias === 1).length,
        inactiveUsers: records.filter(r => r.dias_inativo > 90).length,
      };

      return {
        statistics: stats,
        users: records,
      };
    } catch (error) {
      logger.error(`Error getting license utilization: ${error.message}`);
      throw error;
    }
  }

  async getCostAnalysis(clientId) {
    try {
      const result = await pool.request()
        .query(`
          SELECT TOP 1 *
          FROM [dbo].[license_costs_analysis]
          ORDER BY [data_analise] DESC
        `);

      if (result.recordset.length === 0) {
        return null;
      }

      const analysis = result.recordset[0];

      // Calculate additional metrics
      return {
        ...analysis,
        roi: {
          potentialMonthlySavings: analysis.economia_potencial_mensal_brl,
          potentialAnnualSavings: analysis.economia_potencial_anual_brl,
          savingsPercentage: analysis.economia_potencial_anual_brl / analysis.custo_anual_estimado_brl * 100,
        },
        utilizationMetrics: {
          activeUsers: analysis.total_usuarios - analysis.licencas_inativas,
          utilizedPercentage: (1 - analysis.licencas_inativas / analysis.total_licencas) * 100,
          underutilizedPercentage: (analysis.licencas_subutilizadas / analysis.total_licencas) * 100,
        },
      };
    } catch (error) {
      logger.error(`Error getting cost analysis: ${error.message}`);
      throw error;
    }
  }

  async getRecommendations(clientId, limit = 20) {
    try {
      const result = await pool.request()
        .input('limit', limit)
        .query(`
          SELECT TOP (@limit) *
          FROM [dbo].[license_recommendations]
          WHERE [resolvido] = 0
          ORDER BY [severidade] DESC, [prioridade] ASC, [data_criacao] DESC
        `);

      // Group by type
      const grouped = {};
      result.recordset.forEach(rec => {
        if (!grouped[rec.tipo]) {
          grouped[rec.tipo] = [];
        }
        grouped[rec.tipo].push(rec);
      });

      return {
        total: result.recordset.length,
        byType: grouped,
        recommendations: result.recordset,
      };
    } catch (error) {
      logger.error(`Error getting recommendations: ${error.message}`);
      throw error;
    }
  }

  async markRecommendationAsResolved(recommendationId) {
    try {
      await pool.request()
        .input('recommendationId', recommendationId)
        .query(`
          UPDATE [dbo].[license_recommendations]
          SET [resolvido] = 1
          WHERE [id] = @recommendationId
        `);

      return true;
    } catch (error) {
      logger.error(`Error marking recommendation as resolved: ${error.message}`);
      throw error;
    }
  }

  async importLicenseData(licensesData) {
    try {
      const request = pool.request();

      // Insert/Update license plans
      if (licensesData.licensesByType) {
        for (const [skuId, count] of Object.entries(licensesData.licensesByType)) {
          await request
            .input('skuId', skuId)
            .input('skuName', skuId)
            .input('displayName', skuId)
            .input('categoria', 'Microsoft 365')
            .execute('sp_UpsertLicensePlan');
        }
      }

      // Insert user licenses
      if (licensesData.detailedLicenseData) {
        for (const user of licensesData.detailedLicenseData) {
          if (user.licenses && user.licenses.length > 0) {
            for (const license of user.licenses) {
              await pool.request()
                .input('userId', user.userPrincipalName)
                .input('userEmail', user.mail)
                .input('skuId', license.sku)
                .input('skuName', license.displayName)
                .query(`
                  INSERT INTO [dbo].[user_licenses]
                    ([user_id], [user_email], [sku_id], [sku_name], [status])
                  VALUES (@userId, @userEmail, @skuId, @skuName, 'active')
                `);
            }
          }
        }
      }

      // Calculate costs
      await pool.request().execute('sp_CalculateLicenseCostsAnalysis');

      // Generate recommendations
      await pool.request().execute('sp_GenerateLicenseRecommendations');

      logger.info('License data imported successfully');
      return true;
    } catch (error) {
      logger.error(`Error importing license data: ${error.message}`);
      throw error;
    }
  }

  async generateLicenseReport(clientId) {
    try {
      const dashboard = await this.getLicenseDashboard(clientId);
      const utilization = await this.getLicenseUtilization(clientId);
      const costAnalysis = await this.getCostAnalysis(clientId);
      const recommendations = await this.getRecommendations(clientId, 10);
      const unusedLicenses = await this.getUnusedLicenses(clientId);

      return {
        generatedAt: new Date().toISOString(),
        dashboard,
        utilization,
        costAnalysis,
        recommendations,
        unusedLicenses,
        summary: {
          totalLicenses: dashboard.licenseSummary.reduce((sum, l) => sum + l.total_licencas, 0),
          totalUsers: dashboard.costAnalysis?.total_usuarios || 0,
          monthlyEstimatedCost: dashboard.costAnalysis?.custo_mensal_estimado_brl || 0,
          annualEstimatedCost: dashboard.costAnalysis?.custo_anual_estimado_brl || 0,
          potentialMonthlySavings: dashboard.costAnalysis?.economia_potencial_mensal_brl || 0,
          potentialAnnualSavings: dashboard.costAnalysis?.economia_potencial_anual_brl || 0,
        },
      };
    } catch (error) {
      logger.error(`Error generating license report: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new LicenseService();
