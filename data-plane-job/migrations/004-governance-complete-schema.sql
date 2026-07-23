-- ============================================================================
-- Complete Governance Schema - All Dashboards (Overview, Security, Sites, Storage, Sharing, Permissions)
-- ============================================================================

-- ==========================
-- SITES ANALYSIS TABLES
-- ==========================

-- Site health scores and compliance metrics
CREATE TABLE [dbo].[sites_analysis] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [site_id] NVARCHAR(128) NOT NULL,
    [site_name] NVARCHAR(256) NOT NULL,
    [site_url] NVARCHAR(512) NOT NULL,
    [site_owner] NVARCHAR(256) NULL,
    [owner_email] NVARCHAR(256) NULL,
    [health_score] INT DEFAULT 50, -- 0-100
    [compliance_rate] INT DEFAULT 50, -- 0-100
    [total_users] INT DEFAULT 0,
    [total_storage_gb] DECIMAL(18,2) DEFAULT 0,
    [stale_files_count] INT DEFAULT 0,
    [external_shares] INT DEFAULT 0,
    [inactive_users] INT DEFAULT 0,
    [security_findings] INT DEFAULT 0,
    [last_scan] DATETIME2 DEFAULT GETUTCDATE(),
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_sites_analysis] PRIMARY KEY CLUSTERED ([site_id]),
    UNIQUE NONCLUSTERED ([site_url])
);
CREATE NONCLUSTERED INDEX [IX_sites_health] ON [dbo].[sites_analysis] ([health_score] DESC);
CREATE NONCLUSTERED INDEX [IX_sites_owner] ON [dbo].[sites_analysis] ([site_owner]);

-- ==========================
-- SECURITY FINDINGS TABLE
-- ==========================

CREATE TABLE [dbo].[security_findings] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [finding_id] NVARCHAR(128) NOT NULL UNIQUE,
    [category] NVARCHAR(64) NOT NULL, -- 'external_sharing', 'weak_permissions', 'mfa_not_enabled', etc.
    [severity] NVARCHAR(32) NOT NULL, -- 'critical', 'high', 'medium', 'low'
    [title] NVARCHAR(256) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [site_id] NVARCHAR(128) NULL,
    [site_name] NVARCHAR(256) NULL,
    [affected_count] INT DEFAULT 0, -- Number of affected users, documents, etc.
    [remediation] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(32) DEFAULT 'open', -- 'open', 'in_progress', 'resolved'
    [data_criacao] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    [data_resolucao] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_security_findings] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_findings_category] ON [dbo].[security_findings] ([category]);
CREATE NONCLUSTERED INDEX [IX_findings_severity] ON [dbo].[security_findings] ([severity]);
CREATE NONCLUSTERED INDEX [IX_findings_status] ON [dbo].[security_findings] ([status]);

-- ==========================
-- SHARING ANALYSIS TABLE
-- ==========================

CREATE TABLE [dbo].[sharing_analysis] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [share_id] NVARCHAR(256) NOT NULL UNIQUE,
    [file_id] NVARCHAR(256) NULL,
    [file_name] NVARCHAR(512) NULL,
    [site_id] NVARCHAR(128) NULL,
    [site_name] NVARCHAR(256) NULL,
    [share_type] NVARCHAR(64) NOT NULL, -- 'external_user', 'public_anyone', 'organization', 'group', 'guest'
    [shared_with] NVARCHAR(512) NULL, -- Email, domain, or group name
    [shared_by] NVARCHAR(256) NULL,
    [share_date] DATETIME2 NULL,
    [expiration_date] DATETIME2 NULL,
    [permissions] NVARCHAR(64) NULL, -- 'read', 'edit', 'owner'
    [is_risky] BIT DEFAULT 0,
    [risk_reason] NVARCHAR(256) NULL, -- 'public_access', 'no_expiration', 'external_domain'
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_sharing_analysis] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_sharing_type] ON [dbo].[sharing_analysis] ([share_type]);
CREATE NONCLUSTERED INDEX [IX_sharing_risky] ON [dbo].[sharing_analysis] ([is_risky]);

-- ==========================
-- USER PERMISSIONS TABLE
-- ==========================

CREATE TABLE [dbo].[user_permissions] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [user_id] NVARCHAR(256) NOT NULL,
    [user_email] NVARCHAR(256) NOT NULL,
    [user_name] NVARCHAR(256) NULL,
    [site_id] NVARCHAR(128) NOT NULL,
    [site_name] NVARCHAR(256) NULL,
    [permission_level] NVARCHAR(64) NOT NULL, -- 'owner', 'member', 'visitor'
    [is_site_owner] BIT DEFAULT 0,
    [mfa_enabled] BIT DEFAULT 0,
    [last_activity] DATETIME2 NULL,
    [inactive_days] INT DEFAULT 0,
    [is_inactive] BIT DEFAULT 0, -- Not accessed in >90 days
    [is_external] BIT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_user_permissions] PRIMARY KEY CLUSTERED ([id]),
    UNIQUE NONCLUSTERED ([user_id], [site_id])
);
CREATE NONCLUSTERED INDEX [IX_permissions_user] ON [dbo].[user_permissions] ([user_email]);
CREATE NONCLUSTERED INDEX [IX_permissions_mfa] ON [dbo].[user_permissions] ([mfa_enabled]);
CREATE NONCLUSTERED INDEX [IX_permissions_inactive] ON [dbo].[user_permissions] ([is_inactive]);

-- ==========================
-- COMPLIANCE FRAMEWORK TABLE
-- ==========================

CREATE TABLE [dbo].[compliance_framework] (
    [id] INT NOT NULL,
    [framework_name] NVARCHAR(64) NOT NULL, -- 'GDPR', 'HIPAA', 'SOC2', 'ISO27001'
    [control_name] NVARCHAR(256) NOT NULL,
    [requirement] NVARCHAR(MAX) NULL,
    [is_compliant] BIT DEFAULT 0,
    [evidence] NVARCHAR(MAX) NULL,
    [remediation] NVARCHAR(MAX) NULL,
    [last_assessed] DATETIME2 NULL,
    CONSTRAINT [PK_compliance_framework] PRIMARY KEY CLUSTERED ([id])
);

-- ==========================
-- GOVERNANCE DASHBOARD AGGREGATES
-- ==========================

CREATE TABLE [dbo].[agg_governance_summary] (
    [metric_date] DATE NOT NULL,
    [total_sites] INT DEFAULT 0,
    [healthy_sites] INT DEFAULT 0,
    [warning_sites] INT DEFAULT 0,
    [critical_sites] INT DEFAULT 0,
    [avg_health_score] INT DEFAULT 0,
    [total_users] INT DEFAULT 0,
    [mfa_enabled_count] INT DEFAULT 0,
    [total_external_shares] INT DEFAULT 0,
    [public_shares] INT DEFAULT 0,
    [security_findings_count] INT DEFAULT 0,
    [compliance_rate] INT DEFAULT 50,
    [total_storage_gb] DECIMAL(18,2) DEFAULT 0,
    [stale_files_gb] DECIMAL(18,2) DEFAULT 0,
    [duplicate_files_gb] DECIMAL(18,2) DEFAULT 0,
    [trash_items_gb] DECIMAL(18,2) DEFAULT 0,
    [last_updated] DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_agg_governance_summary] PRIMARY KEY CLUSTERED ([metric_date])
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Refresh all governance aggregates
CREATE PROCEDURE [dbo].[sp_RefreshCompletGovernanceAggregates]
AS
BEGIN
    DECLARE @MetricDate DATE = CAST(GETUTCDATE() AS DATE);

    -- Delete existing record for today
    DELETE FROM [dbo].[agg_governance_summary] WHERE [metric_date] = @MetricDate;

    -- Calculate and insert summary metrics
    INSERT INTO [dbo].[agg_governance_summary] (
        [metric_date],
        [total_sites],
        [healthy_sites],
        [warning_sites],
        [critical_sites],
        [avg_health_score],
        [total_users],
        [mfa_enabled_count],
        [total_external_shares],
        [public_shares],
        [security_findings_count],
        [compliance_rate],
        [total_storage_gb],
        [stale_files_gb],
        [duplicate_files_gb],
        [trash_items_gb]
    )
    SELECT
        @MetricDate,
        -- Total sites
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis]),
        -- Healthy sites (score >= 80)
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] >= 80),
        -- Warning sites (score 60-79)
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] >= 60 AND [health_score] < 80),
        -- Critical sites (score < 60)
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] < 60),
        -- Average health score
        ISNULL((SELECT AVG(CAST([health_score] AS INT)) FROM [dbo].[sites_analysis]), 50),
        -- Total unique users
        (SELECT COUNT(DISTINCT [user_email]) FROM [dbo].[user_permissions]),
        -- MFA enabled count
        (SELECT COUNT(DISTINCT [user_email]) FROM [dbo].[user_permissions] WHERE [mfa_enabled] = 1),
        -- External shares
        (SELECT COUNT(*) FROM [dbo].[sharing_analysis] WHERE [share_type] IN ('external_user', 'guest')),
        -- Public shares
        (SELECT COUNT(*) FROM [dbo].[sharing_analysis] WHERE [share_type] = 'public_anyone'),
        -- Security findings (open)
        (SELECT COUNT(*) FROM [dbo].[security_findings] WHERE [status] = 'open'),
        -- Compliance rate (placeholder)
        75,
        -- Total storage
        ISNULL((SELECT SUM(CAST([total_storage_gb] AS DECIMAL(18,2))) FROM [dbo].[sites_analysis]), 0),
        -- Stale files
        ISNULL((SELECT SUM(CAST([total_size_gb] AS DECIMAL(18,2))) FROM [dbo].[agg_stale_files]), 0),
        -- Duplicate files
        ISNULL((SELECT SUM(CAST([total_size_gb] AS DECIMAL(18,2))) FROM [dbo].[agg_duplicate_files]), 0),
        -- Trash items
        ISNULL((SELECT SUM(CAST([total_size_gb] AS DECIMAL(18,2))) FROM [dbo].[agg_trash_summary]), 0);
END;
GO

-- Get complete governance overview
CREATE PROCEDURE [dbo].[sp_GetGovernanceOverview]
AS
BEGIN
    SELECT
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis]) as [total_sites],
        (SELECT AVG(CAST([health_score] AS INT)) FROM [dbo].[sites_analysis]) as [avg_health_score],
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] >= 80) as [healthy_sites],
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] >= 60 AND [health_score] < 80) as [warning_sites],
        (SELECT COUNT(DISTINCT [site_id]) FROM [dbo].[sites_analysis] WHERE [health_score] < 60) as [critical_sites],
        (SELECT COUNT(*) FROM [dbo].[security_findings] WHERE [status] = 'open') as [open_findings],
        (SELECT COUNT(DISTINCT [user_email]) FROM [dbo].[user_permissions] WHERE [mfa_enabled] = 1) as [mfa_enabled_users],
        (SELECT COUNT(DISTINCT [user_email]) FROM [dbo].[user_permissions] WHERE [mfa_enabled] = 0) as [mfa_disabled_users],
        (SELECT COUNT(*) FROM [dbo].[sharing_analysis] WHERE [is_risky] = 1) as [risky_shares],
        ISNULL((SELECT SUM(CAST([total_storage_gb] AS DECIMAL(18,2))) FROM [dbo].[sites_analysis]), 0) as [total_storage_gb];
END;
GO

-- Get sites health distribution
CREATE PROCEDURE [dbo].[sp_GetSitesHealthDistribution]
AS
BEGIN
    SELECT
        [site_id],
        [site_name],
        [site_owner],
        [owner_email],
        [health_score],
        [compliance_rate],
        [total_users],
        [total_storage_gb],
        [external_shares],
        [security_findings]
    FROM [dbo].[sites_analysis]
    ORDER BY [health_score] DESC;
END;
GO

-- Get security findings summary
CREATE PROCEDURE [dbo].[sp_GetSecurityFindingsSummary]
    @Status NVARCHAR(32) = 'open'
AS
BEGIN
    SELECT
        [category],
        COUNT(*) as [count],
        MIN([severity]) as [top_severity],
        SUM([affected_count]) as [total_affected]
    FROM [dbo].[security_findings]
    WHERE [status] = @Status
    GROUP BY [category]
    ORDER BY [count] DESC;
END;
GO

-- Get sharing analysis by type
CREATE PROCEDURE [dbo].[sp_GetSharingAnalysisByType]
AS
BEGIN
    SELECT
        [share_type],
        COUNT(*) as [count],
        SUM(CASE WHEN [is_risky] = 1 THEN 1 ELSE 0 END) as [risky_count],
        COUNT(DISTINCT [shared_with]) as [unique_recipients]
    FROM [dbo].[sharing_analysis]
    GROUP BY [share_type]
    ORDER BY [count] DESC;
END;
GO

-- Get user permission risks
CREATE PROCEDURE [dbo].[sp_GetUserPermissionRisks]
AS
BEGIN
    SELECT
        [user_email],
        [user_name],
        COUNT(DISTINCT [site_id]) as [sites_with_access],
        SUM(CASE WHEN [is_site_owner] = 1 THEN 1 ELSE 0 END) as [owned_sites],
        SUM(CASE WHEN [mfa_enabled] = 0 THEN 1 ELSE 0 END) as [sites_without_mfa],
        SUM(CASE WHEN [is_inactive] = 1 THEN 1 ELSE 0 END) as [inactive_sites],
        MAX([last_activity]) as [last_activity],
        SUM(CASE WHEN [permission_level] = 'owner' THEN 1 ELSE 0 END) as [owner_count]
    FROM [dbo].[user_permissions]
    GROUP BY [user_email], [user_name]
    ORDER BY [owner_count] DESC;
END;
GO
