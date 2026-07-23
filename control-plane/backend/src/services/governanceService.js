const { query } = require('./database')

class GovernanceService {
  // ========================================
  // FILES ANALYSIS
  // ========================================

  async getFilesDashboard(clientId) {
    try {
      const [summary] = await query(
        `SELECT
          COUNT(*) as total_files,
          SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as total_size_gb,
          COUNT(DISTINCT site_url) as total_sites,
          SUM(CASE WHEN years_without_changes > 1 THEN 1 ELSE 0 END) as stale_count,
          AVG(CAST(years_without_changes AS DECIMAL(10,2))) as avg_stale_years,
          COUNT(DISTINCT file_type) as unique_file_types
        FROM data_files
        WHERE execution_id = (
          SELECT execution_id FROM executions
          WHERE client_id = @clientId
          ORDER BY created_at DESC LIMIT 1
        )`,
        [{ name: 'clientId', value: clientId }]
      )

      const [fileTypes] = await query(
        `SELECT TOP 10
          file_type,
          COUNT(*) as count,
          SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as size_gb,
          SUM(CASE WHEN years_without_changes > 1 THEN 1 ELSE 0 END) as stale_count
        FROM data_files
        WHERE execution_id = (
          SELECT execution_id FROM executions
          WHERE client_id = @clientId
          ORDER BY created_at DESC LIMIT 1
        )
        GROUP BY file_type
        ORDER BY size_gb DESC`,
        [{ name: 'clientId', value: clientId }]
      )

      const [recommendations] = await query(
        `SELECT TOP 5 *
        FROM governance_recommendations
        WHERE tipo IN ('stale_files', 'duplicate_candidates')
        AND resolvido = 0
        ORDER BY severidade DESC, data_criacao DESC`,
        []
      )

      return {
        summary: summary || {},
        fileTypes: fileTypes || [],
        topRecommendations: recommendations || []
      }
    } catch (err) {
      throw err
    }
  }

  async getStaleFiles(clientId, minYearsWithoutChanges = 1, limit = 100) {
    try {
      const [files] = await query(
        `SELECT TOP ${limit}
          file_name,
          site_url,
          owner_mail,
          years_without_changes,
          file_size,
          last_modified_date,
          CASE
            WHEN years_without_changes > 3 THEN 'Critical'
            WHEN years_without_changes > 2 THEN 'High'
            ELSE 'Medium'
          END as priority
        FROM data_files
        WHERE execution_id = (
          SELECT execution_id FROM executions
          WHERE client_id = @clientId
          ORDER BY created_at DESC LIMIT 1
        )
        AND years_without_changes > @minYears
        ORDER BY years_without_changes DESC, file_size DESC`,
        [
          { name: 'clientId', value: clientId },
          { name: 'minYears', value: minYearsWithoutChanges }
        ]
      )

      const summary = {
        total: files.length,
        potentialSavingsGb: (files.reduce((sum, f) => sum + (f.file_size || 0), 0)) / 1073741824.0,
        byPriority: {
          critical: files.filter(f => f.priority === 'Critical').length,
          high: files.filter(f => f.priority === 'High').length,
          medium: files.filter(f => f.priority === 'Medium').length
        }
      }

      return {
        summary,
        items: files
      }
    } catch (err) {
      throw err
    }
  }

  async getDuplicateCandidates(clientId, limit = 50) {
    try {
      const [duplicates] = await query(
        `SELECT TOP ${limit}
          file_hash,
          file_name,
          COUNT(*) as occurrence_count,
          SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as total_size_gb,
          COUNT(DISTINCT site_url) as sites_affected,
          (SUM(CAST(file_size AS BIGINT)) / 1073741824.0 * 0.8) as potential_savings_gb
        FROM data_files
        WHERE execution_id = (
          SELECT execution_id FROM executions
          WHERE client_id = @clientId
          ORDER BY created_at DESC LIMIT 1
        )
        AND file_hash IS NOT NULL
        GROUP BY file_hash, file_name
        HAVING COUNT(*) > 1
        ORDER BY total_size_gb DESC`,
        [{ name: 'clientId', value: clientId }]
      )

      const summary = {
        total: duplicates.length,
        totalSizeGb: duplicates.reduce((sum, d) => sum + (d.total_size_gb || 0), 0),
        potentialSavingsGb: duplicates.reduce((sum, d) => sum + (d.potential_savings_gb || 0), 0)
      }

      return {
        summary,
        items: duplicates
      }
    } catch (err) {
      throw err
    }
  }

  async getFilesByType(clientId) {
    try {
      const [fileTypes] = await query(
        `SELECT
          file_type,
          COUNT(*) as count,
          SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as size_gb,
          AVG(CAST(years_without_changes AS DECIMAL(10,2))) as avg_age_years,
          SUM(CASE WHEN years_without_changes > 1 THEN 1 ELSE 0 END) as stale_count
        FROM data_files
        WHERE execution_id = (
          SELECT execution_id FROM executions
          WHERE client_id = @clientId
          ORDER BY created_at DESC LIMIT 1
        )
        GROUP BY file_type
        ORDER BY size_gb DESC`,
        [{ name: 'clientId', value: clientId }]
      )

      return fileTypes || []
    } catch (err) {
      throw err
    }
  }

  // ========================================
  // TRASH ANALYSIS
  // ========================================

  async getTrashDashboard(clientId) {
    try {
      const [summary] = await query(
        `SELECT
          COUNT(*) as total_items,
          SUM(CAST(size_bytes AS BIGINT)) / 1073741824.0 as total_size_gb,
          COUNT(DISTINCT site_title) as sites_with_trash,
          AVG(DATEDIFF(DAY, deleted_date, GETUTCDATE())) as avg_retention_days,
          MIN(deleted_date) as oldest_item_date,
          MAX(deleted_date) as newest_item_date
        FROM trash_items`,
        []
      )

      const [bySite] = await query(
        `SELECT TOP 10
          site_title,
          COUNT(*) as item_count,
          SUM(CAST(size_bytes AS BIGINT)) / 1073741824.0 as size_gb,
          AVG(DATEDIFF(DAY, deleted_date, GETUTCDATE())) as avg_retention_days
        FROM trash_items
        GROUP BY site_title
        ORDER BY size_gb DESC`,
        []
      )

      const [recommendations] = await query(
        `SELECT TOP 3 *
        FROM governance_recommendations
        WHERE tipo IN ('retention_policy', 'large_trash_items')
        AND resolvido = 0
        ORDER BY severidade DESC`,
        []
      )

      return {
        summary: summary || {},
        bySite: bySite || [],
        recommendations: recommendations || []
      }
    } catch (err) {
      throw err
    }
  }

  async getTrashItems(clientId, siteFilter = null, limit = 500) {
    try {
      let sql = `SELECT TOP ${limit} *
                FROM trash_items`

      const params = []
      if (siteFilter) {
        sql += ` WHERE site_title LIKE @siteFilter`
        params.push({ name: 'siteFilter', value: `%${siteFilter}%` })
      }

      sql += ` ORDER BY deleted_date DESC`

      const [items] = await query(sql, params)

      return items || []
    } catch (err) {
      throw err
    }
  }

  async getTrashSummaryBySite(clientId) {
    try {
      const [sites] = await query(
        `SELECT
          site_title,
          COUNT(*) as item_count,
          SUM(CAST(size_bytes AS BIGINT)) / 1073741824.0 as size_gb,
          MIN(deleted_date) as oldest_item,
          MAX(deleted_date) as newest_item
        FROM trash_items
        GROUP BY site_title
        ORDER BY size_gb DESC`,
        []
      )

      return sites || []
    } catch (err) {
      throw err
    }
  }

  // ========================================
  // RECOMMENDATIONS
  // ========================================

  async getRecommendations(clientId, type = null, limit = 20) {
    try {
      let sql = `SELECT TOP ${limit} *
                FROM governance_recommendations
                WHERE resolvido = 0`

      const params = []

      if (type) {
        sql += ` AND tipo = @tipo`
        params.push({ name: 'tipo', value: type })
      }

      sql += ` ORDER BY severidade DESC, data_criacao DESC`

      const [recs] = await query(sql, params)

      return recs || []
    } catch (err) {
      throw err
    }
  }

  async markRecommendationAsResolved(recommendationId) {
    try {
      await query(
        `UPDATE governance_recommendations
        SET resolvido = 1
        WHERE id = @id`,
        [{ name: 'id', value: recommendationId }]
      )

      return { success: true }
    } catch (err) {
      throw err
    }
  }

  // ========================================
  // DATA IMPORT (from PowerShell collection)
  // ========================================

  async importFilesData(filesData) {
    try {
      if (!filesData || !filesData.files || filesData.files.length === 0) {
        return { imported: 0 }
      }

      // Batch insert files
      const batchSize = 500
      for (let i = 0; i < filesData.files.length; i += batchSize) {
        const batch = filesData.files.slice(i, i + batchSize)

        for (const file of batch) {
          await query(
            `INSERT INTO data_files (
              file_id, file_name, file_size, total_file_size, versions_count, file_type,
              file_hash, file_compliance_tag, file_sec_classification, file_url, site_name,
              site_url, relative_url, owner_name, owner_mail, created_date,
              last_modified_user, last_modified_mail, last_modified_date, is_subsite,
              preservation_hold_library, years_without_changes
            ) VALUES (
              @file_id, @file_name, @file_size, @total_file_size, @versions_count, @file_type,
              @file_hash, @file_compliance_tag, @file_sec_classification, @file_url, @site_name,
              @site_url, @relative_url, @owner_name, @owner_mail, @created_date,
              @last_modified_user, @last_modified_mail, @last_modified_date, @is_subsite,
              @preservation_hold_library, @years_without_changes
            )`,
            [
              { name: 'file_id', value: file.file_id },
              { name: 'file_name', value: file.file_name },
              { name: 'file_size', value: file.file_size },
              { name: 'total_file_size', value: file.total_file_size },
              { name: 'versions_count', value: file.versions_count },
              { name: 'file_type', value: file.file_type },
              { name: 'file_hash', value: file.file_hash || null },
              { name: 'file_compliance_tag', value: file.file_compliance_tag || null },
              { name: 'file_sec_classification', value: file.file_sec_classification || null },
              { name: 'file_url', value: file.file_url },
              { name: 'site_name', value: file.site_name },
              { name: 'site_url', value: file.site_url },
              { name: 'relative_url', value: file.relative_url },
              { name: 'owner_name', value: file.owner_name || null },
              { name: 'owner_mail', value: file.owner_mail || null },
              { name: 'created_date', value: file.created_date },
              { name: 'last_modified_user', value: file.last_modified_user || null },
              { name: 'last_modified_mail', value: file.last_modified_mail || null },
              { name: 'last_modified_date', value: file.last_modified_date },
              { name: 'is_subsite', value: file.is_subsite ? 1 : 0 },
              { name: 'preservation_hold_library', value: file.preservation_hold_library ? 1 : 0 },
              { name: 'years_without_changes', value: file.years_without_changes }
            ]
          )
        }
      }

      // Refresh aggregations
      await query(`EXEC sp_RefreshGovernanceAggregates`, [])

      return { imported: filesData.files.length }
    } catch (err) {
      throw err
    }
  }

  async importTrashData(trashData) {
    try {
      if (!trashData || !trashData.items || trashData.items.length === 0) {
        return { imported: 0 }
      }

      // Batch insert trash items
      const batchSize = 500
      for (let i = 0; i < trashData.items.length; i += batchSize) {
        const batch = trashData.items.slice(i, i + batchSize)

        for (const item of batch) {
          await query(
            `INSERT INTO trash_items (
              site_id, site_title, item_id, item_title, item_type, deleted_by,
              deleted_date, original_location, size_bytes, item_state
            ) VALUES (
              @site_id, @site_title, @item_id, @item_title, @item_type, @deleted_by,
              @deleted_date, @original_location, @size_bytes, @item_state
            )`,
            [
              { name: 'site_id', value: item.site_id },
              { name: 'site_title', value: item.site_title },
              { name: 'item_id', value: item.item_id },
              { name: 'item_title', value: item.item_title },
              { name: 'item_type', value: item.item_type },
              { name: 'deleted_by', value: item.deleted_by },
              { name: 'deleted_date', value: item.deleted_date },
              { name: 'original_location', value: item.original_location },
              { name: 'size_bytes', value: item.size_bytes },
              { name: 'item_state', value: item.item_state }
            ]
          )
        }
      }

      // Refresh aggregations
      await query(`EXEC sp_RefreshGovernanceAggregates`, [])

      return { imported: trashData.items.length }
    } catch (err) {
      throw err
    }
  }

  async generateGovernanceReport(clientId) {
    try {
      const filesDashboard = await this.getFilesDashboard(clientId)
      const staleFiles = await this.getStaleFiles(clientId)
      const duplicates = await this.getDuplicateCandidates(clientId)
      const trashDashboard = await this.getTrashDashboard(clientId)
      const recommendations = await this.getRecommendations(clientId)

      return {
        files: filesDashboard,
        staleFiles,
        duplicates,
        trash: trashDashboard,
        recommendations,
        generatedAt: new Date().toISOString()
      }
    } catch (err) {
      throw err
    }
  }
}

module.exports = new GovernanceService()
