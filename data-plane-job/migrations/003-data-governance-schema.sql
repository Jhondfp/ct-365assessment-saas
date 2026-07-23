-- ============================================================================
-- Data Governance Schema - Files & Trash Analysis
-- Tenant-isolated tables for SharePoint file metadata and trash tracking
-- ============================================================================

-- ==========================
-- 1. FILES METADATA TABLE
-- ==========================
CREATE TABLE [dbo].[data_files] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [file_id] NVARCHAR(128) NULL,
    [file_name] NVARCHAR(512) NOT NULL,
    [file_size] BIGINT NULL,
    [total_file_size] BIGINT NULL,
    [versions_count] INT NULL,
    [file_type] NVARCHAR(32) NULL,
    [file_hash] NVARCHAR(256) NULL,
    [file_compliance_tag] NVARCHAR(256) NULL,
    [file_sec_classification] NVARCHAR(128) NULL,
    [file_url] NVARCHAR(MAX) NULL,
    [site_name] NVARCHAR(256) NULL,
    [site_url] NVARCHAR(512) NULL,
    [relative_url] NVARCHAR(MAX) NULL,
    [owner_name] NVARCHAR(256) NULL,
    [owner_mail] NVARCHAR(256) NULL,
    [created_date] DATETIME2 NULL,
    [last_modified_user] NVARCHAR(256) NULL,
    [last_modified_mail] NVARCHAR(256) NULL,
    [last_modified_date] DATETIME2 NULL,
    [is_subsite] BIT DEFAULT 0,
    [preservation_hold_library] BIT DEFAULT 0,
    [years_without_changes] DECIMAL(8,2) NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_data_files] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_files_site_url] ON [dbo].[data_files] ([site_url]);
CREATE NONCLUSTERED INDEX [IX_files_type] ON [dbo].[data_files] ([file_type]);
CREATE NONCLUSTERED INDEX [IX_files_stale] ON [dbo].[data_files] ([years_without_changes] DESC);
CREATE NONCLUSTERED INDEX [IX_files_modified] ON [dbo].[data_files] ([last_modified_date] DESC);

-- ==========================
-- 2. TRASH ITEMS TABLE
-- ==========================
CREATE TABLE [dbo].[trash_items] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [site_id] NVARCHAR(128) NULL,
    [site_title] NVARCHAR(256) NULL,
    [item_id] NVARCHAR(128) NULL,
    [item_title] NVARCHAR(512) NULL,
    [item_type] NVARCHAR(64) NULL,
    [deleted_by] NVARCHAR(256) NULL,
    [deleted_date] DATETIME2 NULL,
    [original_location] NVARCHAR(MAX) NULL,
    [size_bytes] BIGINT NULL,
    [item_state] NVARCHAR(32) NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_trash_items] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_trash_site] ON [dbo].[trash_items] ([site_id]);
CREATE NONCLUSTERED INDEX [IX_trash_deleted_date] ON [dbo].[trash_items] ([deleted_date] DESC);

-- ==========================
-- 3. GOVERNANCE RECOMMENDATIONS
-- ==========================
CREATE TABLE [dbo].[governance_recommendations] (
    [id] NVARCHAR(64) NOT NULL,
    [tipo] NVARCHAR(64) NOT NULL, -- 'stale_files', 'duplicate_candidates', 'retention_policy', 'compliance_issue'
    [severidade] NVARCHAR(32) NOT NULL, -- 'high', 'medium', 'low'
    [titulo] NVARCHAR(256) NOT NULL,
    [descricao] NVARCHAR(MAX) NULL,
    [economia_potencial_gb] DECIMAL(18,2) NULL,
    [arquivo_ids] NVARCHAR(MAX) NULL, -- JSON array of file_ids
    [site_url] NVARCHAR(512) NULL,
    [data_criacao] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    [resolvido] BIT DEFAULT 0,
    CONSTRAINT [PK_governance_recommendations] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_gov_rec_tipo] ON [dbo].[governance_recommendations] ([tipo]);
CREATE NONCLUSTERED INDEX [IX_gov_rec_severidade] ON [dbo].[governance_recommendations] ([severidade]);

-- ==========================
-- 4. FILE TYPE STATISTICS
-- ==========================
CREATE TABLE [dbo].[agg_file_types] (
    [file_type] NVARCHAR(32) NOT NULL,
    [total_count] BIGINT DEFAULT 0,
    [total_size_gb] DECIMAL(18,2) DEFAULT 0,
    [avg_age_days] DECIMAL(10,2) DEFAULT 0,
    [stale_count] BIGINT DEFAULT 0, -- files not modified in >365 days
    CONSTRAINT [PK_agg_file_types] PRIMARY KEY CLUSTERED ([file_type])
);

-- ==========================
-- 5. STALE FILES ANALYSIS (pre-aggregated)
-- ==========================
CREATE TABLE [dbo].[agg_stale_files] (
    [site_url] NVARCHAR(512) NOT NULL,
    [years_without_changes] DECIMAL(8,2) NOT NULL,
    [file_count] BIGINT DEFAULT 0,
    [total_size_gb] DECIMAL(18,2) DEFAULT 0,
    CONSTRAINT [PK_agg_stale_files] PRIMARY KEY CLUSTERED ([site_url], [years_without_changes])
);

-- ==========================
-- 6. DUPLICATE FILE CANDIDATES
-- ==========================
CREATE TABLE [dbo].[agg_duplicate_files] (
    [file_hash] NVARCHAR(256) NOT NULL,
    [file_name] NVARCHAR(512) NOT NULL,
    [occurrence_count] INT DEFAULT 0,
    [total_size_gb] DECIMAL(18,2) DEFAULT 0,
    [sites_affected] INT DEFAULT 0,
    CONSTRAINT [PK_agg_duplicate_files] PRIMARY KEY CLUSTERED ([file_hash])
);

-- ==========================
-- 7. TRASH SUMMARY
-- ==========================
CREATE TABLE [dbo].[agg_trash_summary] (
    [site_url] NVARCHAR(512) NOT NULL,
    [total_items] BIGINT DEFAULT 0,
    [total_size_gb] DECIMAL(18,2) DEFAULT 0,
    [avg_retention_days] INT DEFAULT 0,
    [last_updated] DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_agg_trash_summary] PRIMARY KEY CLUSTERED ([site_url])
);

-- ==========================
-- 8. STORED PROCEDURES
-- ==========================

-- Procedure to refresh governance aggregations
CREATE PROCEDURE [dbo].[sp_RefreshGovernanceAggregates]
AS
BEGIN
    -- File types aggregation
    DELETE FROM [dbo].[agg_file_types];
    INSERT INTO [dbo].[agg_file_types] ([file_type], [total_count], [total_size_gb], [avg_age_days], [stale_count])
    SELECT
        [file_type],
        COUNT(*) as [total_count],
        SUM(CAST([file_size] AS BIGINT)) / 1073741824.0 as [total_size_gb],
        AVG(DATEDIFF(DAY, [last_modified_date], GETUTCDATE())) as [avg_age_days],
        SUM(CASE WHEN [years_without_changes] > 1 THEN 1 ELSE 0 END) as [stale_count]
    FROM [dbo].[data_files]
    WHERE [file_type] IS NOT NULL
    GROUP BY [file_type];

    -- Stale files aggregation
    DELETE FROM [dbo].[agg_stale_files];
    INSERT INTO [dbo].[agg_stale_files] ([site_url], [years_without_changes], [file_count], [total_size_gb])
    SELECT
        [site_url],
        CEILING([years_without_changes]),
        COUNT(*) as [file_count],
        SUM(CAST([file_size] AS BIGINT)) / 1073741824.0 as [total_size_gb]
    FROM [dbo].[data_files]
    WHERE [years_without_changes] > 1
    GROUP BY [site_url], CEILING([years_without_changes]);

    -- Duplicate candidates aggregation
    DELETE FROM [dbo].[agg_duplicate_files];
    INSERT INTO [dbo].[agg_duplicate_files] ([file_hash], [file_name], [occurrence_count], [total_size_gb], [sites_affected])
    SELECT
        [file_hash],
        [file_name],
        COUNT(*) as [occurrence_count],
        SUM(CAST([file_size] AS BIGINT)) / 1073741824.0 as [total_size_gb],
        COUNT(DISTINCT [site_url]) as [sites_affected]
    FROM [dbo].[data_files]
    WHERE [file_hash] IS NOT NULL
    GROUP BY [file_hash], [file_name]
    HAVING COUNT(*) > 1;

    -- Trash summary aggregation
    DELETE FROM [dbo].[agg_trash_summary];
    INSERT INTO [dbo].[agg_trash_summary] ([site_url], [total_items], [total_size_gb], [avg_retention_days])
    SELECT
        ISNULL([site_url], [site_title]),
        COUNT(*) as [total_items],
        SUM(CAST([size_bytes] AS BIGINT)) / 1073741824.0 as [total_size_gb],
        AVG(DATEDIFF(DAY, [deleted_date], GETUTCDATE())) as [avg_retention_days]
    FROM [dbo].[trash_items]
    GROUP BY [site_url], [site_title];
END;
GO

-- Get stale files by site with priority
CREATE PROCEDURE [dbo].[sp_GetStaledFilesBySite]
    @MinYearsWithoutChanges INT = 1
AS
BEGIN
    SELECT TOP 100
        [site_url],
        [file_name],
        [owner_mail],
        [years_without_changes],
        [file_size],
        [last_modified_date],
        CASE
            WHEN [years_without_changes] > 3 THEN 'Critical'
            WHEN [years_without_changes] > 2 THEN 'High'
            ELSE 'Medium'
        END as [priority],
        (SELECT COUNT(*) FROM [dbo].[data_files] d2
         WHERE d2.[site_url] = d.[site_url]
         AND d2.[years_without_changes] > @MinYearsWithoutChanges) as [stale_count_in_site]
    FROM [dbo].[data_files] d
    WHERE [years_without_changes] > @MinYearsWithoutChanges
    ORDER BY [years_without_changes] DESC, [file_size] DESC;
END;
GO

-- Get duplicate file candidates
CREATE PROCEDURE [dbo].[sp_GetDuplicateCandidates]
    @MinOccurrences INT = 2
AS
BEGIN
    SELECT TOP 100
        [file_hash],
        [file_name],
        [occurrence_count],
        [total_size_gb],
        [sites_affected],
        ([total_size_gb] * 0.8) as [potential_savings_gb] -- Potential savings if keeping 1 copy
    FROM [dbo].[agg_duplicate_files]
    WHERE [occurrence_count] >= @MinOccurrences
    ORDER BY [total_size_gb] DESC;
END;
GO

-- Get trash items by site
CREATE PROCEDURE [dbo].[sp_GetTrashItemsBySite]
    @SiteUrl NVARCHAR(512) = NULL
AS
BEGIN
    SELECT
        [site_title],
        COUNT(*) as [item_count],
        SUM(CAST([size_bytes] AS BIGINT)) / 1073741824.0 as [size_gb],
        MIN([deleted_date]) as [oldest_item],
        MAX([deleted_date]) as [newest_item]
    FROM [dbo].[trash_items]
    WHERE @SiteUrl IS NULL OR [site_url] LIKE @SiteUrl
    GROUP BY [site_title]
    ORDER BY [size_gb] DESC;
END;
GO
