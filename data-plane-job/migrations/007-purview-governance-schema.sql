-- ============================================================================
-- Purview Governance Schema - Data Map, DLP, Compliance Posture
-- ============================================================================

-- ==========================
-- DATA MAP - CLASSIFICAÇÃO
-- ==========================

CREATE TABLE [dbo].[purview_data_map] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [scan_id] NVARCHAR(256) NOT NULL UNIQUE,
    [total_scanned_items] INT DEFAULT 0,
    [classified_items] INT DEFAULT 0,
    [unclassified_items] INT DEFAULT 0,
    [classification_coverage] INT DEFAULT 0, -- 0-100
    [sensitive_items_count] INT DEFAULT 0,
    [scan_start_date] DATETIME2 NULL,
    [scan_end_date] DATETIME2 NULL,
    [status] NVARCHAR(32) DEFAULT 'Completed', -- Scanning, Completed, Failed
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_purview_data_map] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_datamap_coverage] ON [dbo].[purview_data_map] ([classification_coverage] DESC);

-- ==========================
-- SENSITIVE DATA TYPES
-- ==========================

CREATE TABLE [dbo].[purview_sensitive_data_types] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [scan_id] NVARCHAR(256) NOT NULL,
    [data_type_name] NVARCHAR(256) NOT NULL,
    [data_type_category] NVARCHAR(128) NOT NULL, -- PII, Financial, Healthcare, etc
    [count] INT DEFAULT 0,
    [severity] NVARCHAR(32) DEFAULT 'Médio', -- Crítico, Alto, Médio, Baixo
    [is_sensitive] BIT DEFAULT 1,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_sensitive_types] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_sensitive_datamap] FOREIGN KEY ([scan_id]) REFERENCES [dbo].[purview_data_map]([scan_id])
);
CREATE NONCLUSTERED INDEX [IX_sensitive_type_name] ON [dbo].[purview_sensitive_data_types] ([data_type_name]);
CREATE NONCLUSTERED INDEX [IX_sensitive_severity] ON [dbo].[purview_sensitive_data_types] ([severity]);

-- ==========================
-- SENSITIVE DATA LOCATIONS
-- ==========================

CREATE TABLE [dbo].[purview_data_locations] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [scan_id] NVARCHAR(256) NOT NULL,
    [sensitive_type_id] BIGINT NOT NULL,
    [location] NVARCHAR(256) NOT NULL, -- SharePoint, Teams, OneDrive, Exchange
    [location_url] NVARCHAR(512) NULL,
    [item_count] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_data_locations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_location_sensitive] FOREIGN KEY ([sensitive_type_id]) REFERENCES [dbo].[purview_sensitive_data_types]([id]),
    CONSTRAINT [FK_location_datamap] FOREIGN KEY ([scan_id]) REFERENCES [dbo].[purview_data_map]([scan_id])
);
CREATE NONCLUSTERED INDEX [IX_location_name] ON [dbo].[purview_data_locations] ([location]);

-- ==========================
-- DLP POLICIES
-- ==========================

CREATE TABLE [dbo].[purview_dlp_policies] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [policy_id] NVARCHAR(256) NOT NULL UNIQUE,
    [policy_name] NVARCHAR(256) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(32) DEFAULT 'Ativada', -- Ativada, Desativada, Em Testes
    [severity] NVARCHAR(32) DEFAULT 'Alto', -- Crítico, Alto, Médio, Baixo
    [created_date] DATETIME2 NULL,
    [modified_date] DATETIME2 NULL,
    [policy_rules_count] INT DEFAULT 0,
    [is_active] BIT DEFAULT 1,
    [last_triggered] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_dlp_policies] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_dlp_status] ON [dbo].[purview_dlp_policies] ([status]);
CREATE NONCLUSTERED INDEX [IX_dlp_severity] ON [dbo].[purview_dlp_policies] ([severity]);

-- ==========================
-- DLP POLICY LOCATIONS
-- ==========================

CREATE TABLE [dbo].[purview_dlp_locations] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [policy_id] NVARCHAR(256) NOT NULL,
    [location] NVARCHAR(256) NOT NULL, -- SharePoint, Teams, OneDrive, Exchange
    [is_included] BIT DEFAULT 1,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_dlp_locations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_dlp_location] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[purview_dlp_policies]([policy_id])
);

-- ==========================
-- DLP VIOLATIONS
-- ==========================

CREATE TABLE [dbo].[purview_dlp_violations] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [violation_id] NVARCHAR(256) NOT NULL UNIQUE,
    [policy_id] NVARCHAR(256) NOT NULL,
    [policy_name] NVARCHAR(256) NOT NULL,
    [detected_date] DATETIME2 NOT NULL,
    [severity] NVARCHAR(32) DEFAULT 'Médio', -- Crítico, Alto, Médio
    [location] NVARCHAR(256) NOT NULL,
    [user_email] NVARCHAR(256) NULL,
    [action_taken] NVARCHAR(128) DEFAULT 'Notificado', -- Notificado, Bloqueado, Auditado
    [sensitive_info_found] NVARCHAR(256) NULL,
    [item_count] INT DEFAULT 1,
    [is_resolved] BIT DEFAULT 0,
    [resolved_date] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_dlp_violations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_violation_policy] FOREIGN KEY ([policy_id]) REFERENCES [dbo].[purview_dlp_policies]([policy_id])
);
CREATE NONCLUSTERED INDEX [IX_violation_date] ON [dbo].[purview_dlp_violations] ([detected_date] DESC);
CREATE NONCLUSTERED INDEX [IX_violation_severity] ON [dbo].[purview_dlp_violations] ([severity]);
CREATE NONCLUSTERED INDEX [IX_violation_resolved] ON [dbo].[purview_dlp_violations] ([is_resolved]);

-- ==========================
-- COMPLIANCE FRAMEWORKS
-- ==========================

CREATE TABLE [dbo].[purview_compliance_frameworks] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [framework_id] NVARCHAR(128) NOT NULL UNIQUE,
    [framework_name] NVARCHAR(256) NOT NULL,
    [compliance_status] NVARCHAR(32) DEFAULT 'Não Compliant', -- Compliant, Não Compliant, Parcialmente Compliant
    [compliance_score] INT DEFAULT 0, -- 0-100
    [total_controls] INT DEFAULT 0,
    [compliant_controls] INT DEFAULT 0,
    [non_compliant_controls] INT DEFAULT 0,
    [findings_count] INT DEFAULT 0,
    [critical_findings] INT DEFAULT 0,
    [high_findings] INT DEFAULT 0,
    [medium_findings] INT DEFAULT 0,
    [last_assessment_date] DATETIME2 NULL,
    [next_assessment_date] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_compliance_frameworks] PRIMARY KEY CLUSTERED ([id])
);
CREATE NONCLUSTERED INDEX [IX_framework_status] ON [dbo].[purview_compliance_frameworks] ([compliance_status]);
CREATE NONCLUSTERED INDEX [IX_framework_score] ON [dbo].[purview_compliance_frameworks] ([compliance_score] DESC);

-- ==========================
-- COMPLIANCE POSTURE
-- ==========================

CREATE TABLE [dbo].[purview_compliance_posture] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [posture_date] DATE NOT NULL UNIQUE,
    [overall_score] INT DEFAULT 0, -- 0-100
    [data_classification_score] INT DEFAULT 0,
    [dlp_policies_score] INT DEFAULT 0,
    [retention_policies_score] INT DEFAULT 0,
    [compliant_frameworks] INT DEFAULT 0,
    [partially_compliant_frameworks] INT DEFAULT 0,
    [non_compliant_frameworks] INT DEFAULT 0,
    [total_findings] INT DEFAULT 0,
    [critical_findings] INT DEFAULT 0,
    [high_findings] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_compliance_posture] PRIMARY KEY CLUSTERED ([posture_date])
);

-- ==========================
-- DATA RISK ASSESSMENT
-- ==========================

CREATE TABLE [dbo].[purview_data_risk_assessment] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [assessment_date] DATE NOT NULL UNIQUE,
    [risk_score] INT DEFAULT 0, -- 0-100
    [risk_level] NVARCHAR(32) DEFAULT 'Baixo', -- Crítico, Alto, Médio, Baixo
    [sensitive_items_count] INT DEFAULT 0,
    [dlp_violations_count] INT DEFAULT 0,
    [unclassified_items_count] INT DEFAULT 0,
    [exposed_locations_count] INT DEFAULT 0,
    [high_risk_data_types_count] INT DEFAULT 0,
    [recommendations_count] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_data_risk_assessment] PRIMARY KEY CLUSTERED ([assessment_date])
);

-- ==========================
-- DATA RISK RECOMMENDATIONS
-- ==========================

CREATE TABLE [dbo].[purview_data_risk_recommendations] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [recommendation_id] NVARCHAR(256) NOT NULL UNIQUE,
    [assessment_date] DATE NOT NULL,
    [recommendation_text] NVARCHAR(MAX) NOT NULL,
    [category] NVARCHAR(64) NOT NULL, -- classification, dlp, retention, remediation
    [priority] NVARCHAR(32) DEFAULT 'Medium', -- Critical, High, Medium, Low
    [estimated_impact] NVARCHAR(256) NULL,
    [remediation_steps] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(32) DEFAULT 'Open', -- Open, In Progress, Resolved, Ignored
    [created_date] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    [resolved_date] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_risk_recommendations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_recommendation_assessment] FOREIGN KEY ([assessment_date]) REFERENCES [dbo].[purview_data_risk_assessment]([assessment_date])
);
CREATE NONCLUSTERED INDEX [IX_recommendation_priority] ON [dbo].[purview_data_risk_recommendations] ([priority]);
CREATE NONCLUSTERED INDEX [IX_recommendation_status] ON [dbo].[purview_data_risk_recommendations] ([status]);

-- ==========================
-- AGGREGATION TABLES
-- ==========================

CREATE TABLE [dbo].[agg_purview_summary] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [summary_date] DATE NOT NULL UNIQUE,
    [total_sensitive_items] INT DEFAULT 0,
    [classification_coverage] INT DEFAULT 0,
    [active_dlp_policies] INT DEFAULT 0,
    [dlp_violations_last_7days] INT DEFAULT 0,
    [dlp_violations_last_30days] INT DEFAULT 0,
    [compliance_score] INT DEFAULT 0,
    [compliant_frameworks] INT DEFAULT 0,
    [data_risk_score] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_agg_purview_summary] PRIMARY KEY CLUSTERED ([summary_date])
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Procedure to aggregate Purview summary daily
CREATE PROCEDURE [dbo].[sp_AggregatePurviewSummary]
    @summaryDate DATE = NULL
AS
BEGIN
    SET @summaryDate = ISNULL(@summaryDate, CAST(GETUTCDATE() AS DATE));

    DECLARE @totalSensitiveItems INT = (
        SELECT SUM([count])
        FROM [dbo].[purview_sensitive_data_types]
        WHERE CAST([coletado_em] AS DATE) = @summaryDate
    );

    DECLARE @classificationCoverage INT = (
        SELECT TOP 1 [classification_coverage]
        FROM [dbo].[purview_data_map]
        WHERE CAST([coletado_em] AS DATE) = @summaryDate
        ORDER BY [coletado_em] DESC
    );

    DECLARE @activeDLPPolicies INT = (
        SELECT COUNT(*)
        FROM [dbo].[purview_dlp_policies]
        WHERE [is_active] = 1 AND CAST([coletado_em] AS DATE) <= @summaryDate
    );

    DECLARE @dlpViolations7Days INT = (
        SELECT COUNT(*)
        FROM [dbo].[purview_dlp_violations]
        WHERE [detected_date] >= DATEADD(DAY, -7, @summaryDate)
            AND [detected_date] < DATEADD(DAY, 1, @summaryDate)
    );

    DECLARE @dlpViolations30Days INT = (
        SELECT COUNT(*)
        FROM [dbo].[purview_dlp_violations]
        WHERE [detected_date] >= DATEADD(DAY, -30, @summaryDate)
            AND [detected_date] < DATEADD(DAY, 1, @summaryDate)
    );

    DECLARE @complianceScore INT = (
        SELECT TOP 1 [overall_score]
        FROM [dbo].[purview_compliance_posture]
        WHERE [posture_date] <= @summaryDate
        ORDER BY [posture_date] DESC
    );

    DECLARE @compliantFrameworks INT = (
        SELECT COUNT(*)
        FROM [dbo].[purview_compliance_frameworks]
        WHERE [compliance_status] = 'Compliant'
    );

    DECLARE @dataRiskScore INT = (
        SELECT TOP 1 [risk_score]
        FROM [dbo].[purview_data_risk_assessment]
        WHERE [assessment_date] <= @summaryDate
        ORDER BY [assessment_date] DESC
    );

    INSERT INTO [dbo].[agg_purview_summary] (
        summary_date, total_sensitive_items, classification_coverage,
        active_dlp_policies, dlp_violations_last_7days, dlp_violations_last_30days,
        compliance_score, compliant_frameworks, data_risk_score
    )
    VALUES (
        @summaryDate, ISNULL(@totalSensitiveItems, 0), ISNULL(@classificationCoverage, 0),
        ISNULL(@activeDLPPolicies, 0), ISNULL(@dlpViolations7Days, 0), ISNULL(@dlpViolations30Days, 0),
        ISNULL(@complianceScore, 0), ISNULL(@compliantFrameworks, 0), ISNULL(@dataRiskScore, 0)
    );
END;
GO

-- Procedure to update data risk score
CREATE PROCEDURE [dbo].[sp_UpdateDataRiskAssessment]
    @assessmentDate DATE,
    @riskScore INT,
    @sensitiveItemsCount INT,
    @dlpViolationsCount INT,
    @unclassifiedItemsCount INT,
    @exposedLocationsCount INT
AS
BEGIN
    DECLARE @riskLevel NVARCHAR(32);

    IF @riskScore >= 70 SET @riskLevel = 'Crítico'
    ELSE IF @riskScore >= 50 SET @riskLevel = 'Alto'
    ELSE IF @riskScore >= 30 SET @riskLevel = 'Médio'
    ELSE SET @riskLevel = 'Baixo';

    INSERT INTO [dbo].[purview_data_risk_assessment] (
        assessment_date, risk_score, risk_level, sensitive_items_count,
        dlp_violations_count, unclassified_items_count, exposed_locations_count
    ) VALUES (
        @assessmentDate, @riskScore, @riskLevel, @sensitiveItemsCount,
        @dlpViolationsCount, @unclassifiedItemsCount, @exposedLocationsCount
    )
    ON CONFLICT([assessment_date]) DO UPDATE SET
        [risk_score] = @riskScore,
        [risk_level] = @riskLevel,
        [sensitive_items_count] = @sensitiveItemsCount,
        [dlp_violations_count] = @dlpViolationsCount,
        [unclassified_items_count] = @unclassifiedItemsCount,
        [exposed_locations_count] = @exposedLocationsCount;
END;
GO
