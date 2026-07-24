-- ============================================================================
-- Teams Governance Schema - Complete Teams, Channels, Members, Activity Analysis
-- ============================================================================

-- ==========================
-- TEAMS ANALYSIS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_analysis] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [team_id] NVARCHAR(256) NOT NULL UNIQUE,
    [display_name] NVARCHAR(512) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [created_date] DATETIME2 NULL,
    [team_owner] NVARCHAR(256) NULL,
    [owner_email] NVARCHAR(256) NULL,
    [is_archived] BIT DEFAULT 0,
    [is_public] BIT DEFAULT 0,
    [member_count] INT DEFAULT 0,
    [guest_count] INT DEFAULT 0,
    [channel_count] INT DEFAULT 0,
    [storage_gb] DECIMAL(18,2) DEFAULT 0,
    [days_old] INT DEFAULT 0,
    [days_inactive] INT DEFAULT 0,
    [risk_score] INT DEFAULT 0, -- 0-100
    [risk_level] NVARCHAR(32) DEFAULT 'Baixo', -- Crítico, Alto, Médio, Baixo
    [has_retention_policy] BIT DEFAULT 0,
    [last_activity] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_analysis] PRIMARY KEY CLUSTERED ([team_id])
);
CREATE NONCLUSTERED INDEX [IX_teams_risk] ON [dbo].[teams_analysis] ([risk_score] DESC);
CREATE NONCLUSTERED INDEX [IX_teams_owner] ON [dbo].[teams_analysis] ([team_owner]);
CREATE NONCLUSTERED INDEX [IX_teams_archived] ON [dbo].[teams_analysis] ([is_archived]);
CREATE NONCLUSTERED INDEX [IX_teams_inactive] ON [dbo].[teams_analysis] ([days_inactive] DESC);

-- ==========================
-- TEAMS CHANNELS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_channels] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [channel_id] NVARCHAR(256) NOT NULL,
    [team_id] NVARCHAR(256) NOT NULL,
    [display_name] NVARCHAR(512) NOT NULL,
    [channel_type] NVARCHAR(64) DEFAULT 'standard', -- standard, private
    [description] NVARCHAR(MAX) NULL,
    [is_favorite_by_default] BIT DEFAULT 0,
    [has_messages] BIT DEFAULT 0,
    [last_message_date] DATETIME2 NULL,
    [days_since_last_message] INT DEFAULT -1,
    [message_count] INT DEFAULT 0,
    [member_count] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_channels] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_channels_team] FOREIGN KEY ([team_id]) REFERENCES [dbo].[teams_analysis]([team_id])
);
CREATE NONCLUSTERED INDEX [IX_channels_team] ON [dbo].[teams_channels] ([team_id]);
CREATE NONCLUSTERED INDEX [IX_channels_activity] ON [dbo].[teams_channels] ([last_message_date] DESC);

-- ==========================
-- TEAMS MEMBERS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_members] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [member_id] NVARCHAR(256) NOT NULL,
    [team_id] NVARCHAR(256) NOT NULL,
    [display_name] NVARCHAR(256) NOT NULL,
    [email] NVARCHAR(256) NOT NULL,
    [user_principal_name] NVARCHAR(256) NULL,
    [role] NVARCHAR(64) DEFAULT 'member', -- owner, member
    [member_type] NVARCHAR(32) DEFAULT 'user', -- user, guest
    [last_activity] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_members] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_members_team] FOREIGN KEY ([team_id]) REFERENCES [dbo].[teams_analysis]([team_id])
);
CREATE NONCLUSTERED INDEX [IX_members_team] ON [dbo].[teams_members] ([team_id]);
CREATE NONCLUSTERED INDEX [IX_members_email] ON [dbo].[teams_members] ([email]);
CREATE NONCLUSTERED INDEX [IX_members_role] ON [dbo].[teams_members] ([role]);

-- ==========================
-- TEAMS GUESTS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_guests] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [guest_id] NVARCHAR(256) NOT NULL,
    [team_id] NVARCHAR(256) NOT NULL,
    [display_name] NVARCHAR(256) NOT NULL,
    [email] NVARCHAR(256) NOT NULL,
    [guest_domain] NVARCHAR(256) NULL,
    [added_date] DATETIME2 NULL,
    [last_activity] DATETIME2 NULL,
    [days_as_guest] INT DEFAULT 0,
    [is_external] BIT DEFAULT 1,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_guests] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_guests_team] FOREIGN KEY ([team_id]) REFERENCES [dbo].[teams_analysis]([team_id])
);
CREATE NONCLUSTERED INDEX [IX_guests_team] ON [dbo].[teams_guests] ([team_id]);
CREATE NONCLUSTERED INDEX [IX_guests_domain] ON [dbo].[teams_guests] ([guest_domain]);

-- ==========================
-- TEAMS RECOMMENDATIONS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_recommendations] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [recommendation_id] NVARCHAR(256) NOT NULL UNIQUE,
    [team_id] NVARCHAR(256) NOT NULL,
    [recommendation_type] NVARCHAR(64) NOT NULL, -- orphaned, inactive, public, many_guests, no_retention, no_owner
    [recommendation_text] NVARCHAR(MAX) NOT NULL,
    [severity] NVARCHAR(32) DEFAULT 'medium', -- critical, high, medium, low
    [remediation_steps] NVARCHAR(MAX) NULL,
    [status] NVARCHAR(32) DEFAULT 'open', -- open, in_progress, resolved, ignored
    [created_date] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    [resolved_date] DATETIME2 NULL,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_recommendations] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_recommendations_team] FOREIGN KEY ([team_id]) REFERENCES [dbo].[teams_analysis]([team_id])
);
CREATE NONCLUSTERED INDEX [IX_recs_team] ON [dbo].[teams_recommendations] ([team_id]);
CREATE NONCLUSTERED INDEX [IX_recs_severity] ON [dbo].[teams_recommendations] ([severity]);
CREATE NONCLUSTERED INDEX [IX_recs_status] ON [dbo].[teams_recommendations] ([status]);

-- ==========================
-- TEAMS STORAGE ANALYSIS TABLE
-- ==========================

CREATE TABLE [dbo].[teams_storage_analysis] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [team_id] NVARCHAR(256) NOT NULL,
    [total_storage_gb] DECIMAL(18,2) DEFAULT 0,
    [shared_drive_gb] DECIMAL(18,2) DEFAULT 0,
    [files_count] INT DEFAULT 0,
    [largest_file_size_mb] DECIMAL(18,2) DEFAULT 0,
    [oldest_file_date] DATETIME2 NULL,
    [stale_files_30days] INT DEFAULT 0,
    [stale_files_90days] INT DEFAULT 0,
    [stale_files_180days] INT DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_teams_storage] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [FK_storage_team] FOREIGN KEY ([team_id]) REFERENCES [dbo].[teams_analysis]([team_id])
);
CREATE NONCLUSTERED INDEX [IX_storage_team] ON [dbo].[teams_storage_analysis] ([team_id]);

-- ==========================
-- AGGREGATION TABLES
-- ==========================

CREATE TABLE [dbo].[agg_teams_summary] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [summary_date] DATE NOT NULL UNIQUE,
    [total_teams] INT DEFAULT 0,
    [teams_archived] INT DEFAULT 0,
    [teams_orphaned] INT DEFAULT 0,
    [teams_inactive] INT DEFAULT 0,
    [teams_public] INT DEFAULT 0,
    [teams_high_risk] INT DEFAULT 0,
    [total_members] INT DEFAULT 0,
    [total_guests] INT DEFAULT 0,
    [total_channels] INT DEFAULT 0,
    [total_storage_gb] DECIMAL(18,2) DEFAULT 0,
    [risk_score_avg] DECIMAL(5,2) DEFAULT 0,
    [coletado_em] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_agg_teams_summary] PRIMARY KEY CLUSTERED ([summary_date])
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Procedure to aggregate Teams data daily
CREATE PROCEDURE [dbo].[sp_AggregateTeamsSummary]
    @summaryDate DATE = NULL
AS
BEGIN
    SET @summaryDate = ISNULL(@summaryDate, CAST(GETUTCDATE() AS DATE));

    INSERT INTO [dbo].[agg_teams_summary] (
        summary_date, total_teams, teams_archived, teams_orphaned,
        teams_inactive, teams_public, teams_high_risk, total_members,
        total_guests, total_channels, total_storage_gb, risk_score_avg
    )
    SELECT
        @summaryDate,
        COUNT(DISTINCT [team_id]),
        SUM(CASE WHEN [is_archived] = 1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN [team_owner] IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN [days_inactive] > 180 THEN 1 ELSE 0 END),
        SUM(CASE WHEN [is_public] = 1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN [risk_score] >= 50 THEN 1 ELSE 0 END),
        SUM([member_count]),
        SUM([guest_count]),
        SUM([channel_count]),
        SUM([storage_gb]),
        AVG(CAST([risk_score] AS DECIMAL(5,2)))
    FROM [dbo].[teams_analysis]
    WHERE CAST([coletado_em] AS DATE) = @summaryDate;
END;
GO

-- Procedure to calculate Teams risk scores
CREATE PROCEDURE [dbo].[sp_CalculateTeamsRiskScore]
    @teamId NVARCHAR(256)
AS
BEGIN
    DECLARE @riskScore INT = 0;
    DECLARE @daysInactive INT;
    DECLARE @memberCount INT;
    DECLARE @guestCount INT;
    DECLARE @isOrphaned BIT;
    DECLARE @isPublic BIT;
    DECLARE @isArchived BIT;

    SELECT
        @daysInactive = [days_inactive],
        @memberCount = [member_count],
        @guestCount = [guest_count],
        @isOrphaned = CASE WHEN [team_owner] IS NULL THEN 1 ELSE 0 END,
        @isPublic = [is_public],
        @isArchived = [is_archived]
    FROM [dbo].[teams_analysis]
    WHERE [team_id] = @teamId;

    -- Orphaned team (no owner): 40 points
    IF @isOrphaned = 1 SET @riskScore = @riskScore + 40;

    -- Inactive >180 days: 35 points
    IF @daysInactive > 180 SET @riskScore = @riskScore + 35;

    -- Public team: 20 points
    IF @isPublic = 1 SET @riskScore = @riskScore + 20;

    -- Many guests (>50): 15 points
    IF @guestCount > 50 SET @riskScore = @riskScore + 15;

    -- Mitigating factor: archived team: -50 points
    IF @isArchived = 1 SET @riskScore = CASE WHEN @riskScore >= 50 THEN @riskScore - 50 ELSE 0 END;

    -- Cap at 100
    SET @riskScore = CASE WHEN @riskScore > 100 THEN 100 ELSE @riskScore END;

    UPDATE [dbo].[teams_analysis]
    SET
        [risk_score] = @riskScore,
        [risk_level] = CASE
            WHEN @riskScore >= 70 THEN 'Crítico'
            WHEN @riskScore >= 50 THEN 'Alto'
            WHEN @riskScore >= 30 THEN 'Médio'
            ELSE 'Baixo'
        END
    WHERE [team_id] = @teamId;
END;
GO

-- Procedure to generate Teams recommendations
CREATE PROCEDURE [dbo].[sp_GenerateTeamsRecommendations]
    @teamId NVARCHAR(256)
AS
BEGIN
    DECLARE @teamName NVARCHAR(512);
    DECLARE @daysInactive INT;
    DECLARE @guestCount INT;
    DECLARE @isOrphaned BIT;
    DECLARE @isPublic BIT;
    DECLARE @hasRetention BIT;

    SELECT
        @teamName = [display_name],
        @daysInactive = [days_inactive],
        @guestCount = [guest_count],
        @isOrphaned = CASE WHEN [team_owner] IS NULL THEN 1 ELSE 0 END,
        @isPublic = [is_public],
        @hasRetention = [has_retention_policy]
    FROM [dbo].[teams_analysis]
    WHERE [team_id] = @teamId;

    -- Delete existing recommendations for this team
    DELETE FROM [dbo].[teams_recommendations]
    WHERE [team_id] = @teamId AND [status] = 'open';

    -- Orphaned team recommendation
    IF @isOrphaned = 1
    BEGIN
        INSERT INTO [dbo].[teams_recommendations] (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            NEWID(), @teamId, 'orphaned',
            'Este Time não possui proprietário designado',
            'critical',
            'Acesse configurações do Time > Membros > Designar um proprietário'
        );
    END

    -- Inactive team recommendation
    IF @daysInactive > 180
    BEGIN
        INSERT INTO [dbo].[teams_recommendations] (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            NEWID(), @teamId, 'inactive',
            'Este Time está inativo há mais de 6 meses',
            'high',
            'Considere arquivar o Time se não for mais utilizado > Configurações > Arquivar este Time'
        );
    END

    -- Public team recommendation
    IF @isPublic = 1
    BEGIN
        INSERT INTO [dbo].[teams_recommendations] (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            NEWID(), @teamId, 'public',
            'Este é um Time público - qualquer usuário pode se juntar',
            'high',
            'Verifique dados sensíveis > Configurações > Alterar para Privado se necessário'
        );
    END

    -- Many guests recommendation
    IF @guestCount > 50
    BEGIN
        INSERT INTO [dbo].[teams_recommendations] (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            NEWID(), @teamId, 'many_guests',
            'Este Time possui muitos convidados externos (' + CAST(@guestCount AS NVARCHAR(10)) + ')',
            'medium',
            'Revise o acesso de convidados > Configurações > Membros > Gerenciar convidados'
        );
    END

    -- No retention policy recommendation
    IF @hasRetention = 0
    BEGIN
        INSERT INTO [dbo].[teams_recommendations] (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            NEWID(), @teamId, 'no_retention',
            'Nenhuma política de retenção de mensagens configurada',
            'medium',
            'Configure política de retenção > Centro de Conformidade > Políticas de Retenção'
        );
    END
END;
GO
