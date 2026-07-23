const { getTenantConnection } = require('./database');

class CompleteGovernanceService {
  // Get governance overview dashboard data
  async getOverview(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .execute('sp_GetGovernanceOverview');

      return {
        success: true,
        data: result.recordset[0] || {},
      };
    } catch (error) {
      console.error('Error getting governance overview:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get sites health distribution
  async getSitesHealthDistribution(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .execute('sp_GetSitesHealthDistribution');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting sites health distribution:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get security findings summary
  async getSecurityFindings(tenantId, status = 'open') {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('Status', status)
        .execute('sp_GetSecurityFindingsSummary');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting security findings:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get sharing analysis by type
  async getSharingAnalysis(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .execute('sp_GetSharingAnalysisByType');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting sharing analysis:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get user permission risks
  async getUserPermissionRisks(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .execute('sp_GetUserPermissionRisks');

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting user permission risks:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get risky shares
  async getRiskyShares(tenantId, limit = 100) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('Limit', limit)
        .query(`
          SELECT TOP (@Limit)
            [share_id],
            [file_name],
            [share_type],
            [shared_with],
            [permissions],
            [is_risky],
            [risk_reason],
            [share_date]
          FROM [dbo].[sharing_analysis]
          WHERE [is_risky] = 1
          ORDER BY [share_date] DESC
        `);

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting risky shares:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get users with excessive permissions
  async getExcessivePermissions(tenantId, limit = 100) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('Limit', limit)
        .query(`
          SELECT TOP (@Limit)
            [user_email],
            [user_name],
            COUNT(DISTINCT [site_id]) as [site_count],
            SUM(CASE WHEN [permission_level] = 'owner' THEN 1 ELSE 0 END) as [owner_count],
            SUM(CASE WHEN [mfa_enabled] = 0 THEN 1 ELSE 0 END) as [no_mfa_count]
          FROM [dbo].[user_permissions]
          GROUP BY [user_email], [user_name]
          HAVING COUNT(DISTINCT [site_id]) > 5
          ORDER BY [owner_count] DESC
        `);

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting excessive permissions:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get compliance framework status
  async getComplianceFramework(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .query(`
          SELECT
            [framework_name],
            [control_name],
            [is_compliant],
            [evidence],
            [last_assessed]
          FROM [dbo].[compliance_framework]
          ORDER BY [framework_name], [control_name]
        `);

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting compliance framework:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Refresh all governance aggregates
  async refreshGovernanceAggregates(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      await conn.request()
        .execute('sp_RefreshCompletGovernanceAggregates');

      return {
        success: true,
        message: 'Governance aggregates refreshed successfully',
      };
    } catch (error) {
      console.error('Error refreshing governance aggregates:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get sites detail with filters
  async getSitesDetail(tenantId, searchTerm = '', healthScoreMin = 0) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .input('SearchTerm', `%${searchTerm}%`)
        .input('HealthScoreMin', healthScoreMin)
        .query(`
          SELECT
            [site_id],
            [site_name],
            [site_url],
            [site_owner],
            [owner_email],
            [health_score],
            [compliance_rate],
            [total_users],
            [total_storage_gb],
            [stale_files_count],
            [external_shares],
            [security_findings],
            [last_scan]
          FROM [dbo].[sites_analysis]
          WHERE ([site_name] LIKE @SearchTerm OR @SearchTerm = '%%')
            AND [health_score] >= @HealthScoreMin
          ORDER BY [health_score] DESC
        `);

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting sites detail:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Get storage optimization recommendations
  async getStorageRecommendations(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      const result = await conn.request()
        .query(`
          SELECT
            [id],
            [tipo] as [type],
            [severidade] as [severity],
            [titulo] as [title],
            [descricao] as [description],
            [economia_potencial_gb] as [potential_savings_gb],
            [site_url],
            [data_criacao] as [created_at],
            [resolvido] as [resolved]
          FROM [dbo].[governance_recommendations]
          WHERE [tipo] IN ('stale_files', 'duplicate_candidates')
            AND [resolvido] = 0
          ORDER BY [economia_potencial_gb] DESC
        `);

      return {
        success: true,
        data: result.recordset || [],
      };
    } catch (error) {
      console.error('Error getting storage recommendations:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }

  // Seed initial governance data (for testing/demo)
  async seedGovernanceData(tenantId) {
    const conn = await getTenantConnection(tenantId);
    try {
      // Insert sample sites
      await conn.request()
        .query(`
          INSERT INTO [dbo].[sites_analysis] (site_id, site_name, site_url, site_owner, owner_email, health_score, compliance_rate, total_users, total_storage_gb, security_findings)
          VALUES
            ('site-1', 'Legal Hub', 'https://company.sharepoint.com/sites/legal', 'john.smith@company.com', 'john.smith@company.com', 95, 95, 42, 45.2, 1),
            ('site-2', 'Finance Team', 'https://company.sharepoint.com/sites/finance', 'maria.silva@company.com', 'maria.silva@company.com', 88, 88, 28, 78.9, 3),
            ('site-3', 'HR Operations', 'https://company.sharepoint.com/sites/hr', 'admin@company.com', 'admin@company.com', 82, 82, 35, 56.3, 5),
            ('site-4', 'Marketing Hub', 'https://company.sharepoint.com/sites/marketing', 'sarah.jones@company.com', 'sarah.jones@company.com', 76, 76, 22, 124.5, 8),
            ('site-5', 'IT Operations', 'https://company.sharepoint.com/sites/it', 'admin-it@company.com', 'admin-it@company.com', 71, 71, 18, 234.7, 12)
        `);

      // Insert sample security findings
      await conn.request()
        .query(`
          INSERT INTO [dbo].[security_findings] (finding_id, category, severity, title, site_id, site_name, affected_count, status)
          VALUES
            ('find-1', 'external_sharing', 'critical', 'Excessive External Sharing', 'site-4', 'Marketing Hub', 24, 'open'),
            ('find-2', 'weak_permissions', 'critical', 'Weak Permissions Detected', 'site-5', 'IT Operations', 18, 'open'),
            ('find-3', 'mfa_not_enabled', 'critical', 'MFA Not Enabled for Users', NULL, NULL, 28, 'open'),
            ('find-4', 'inactive_users', 'medium', 'Inactive Users with Access', NULL, NULL, 67, 'open'),
            ('find-5', 'unowned_sites', 'medium', 'Sites Without Owner', NULL, NULL, 3, 'open')
        `);

      return {
        success: true,
        message: 'Governance data seeded successfully',
      };
    } catch (error) {
      // Ignore if data already exists
      if (error.message.includes('PRIMARY KEY')) {
        return {
          success: true,
          message: 'Governance data already exists',
        };
      }
      console.error('Error seeding governance data:', error);
      return {
        success: false,
        error: error.message,
      };
    } finally {
      await conn.close();
    }
  }
}

module.exports = new CompleteGovernanceService();
