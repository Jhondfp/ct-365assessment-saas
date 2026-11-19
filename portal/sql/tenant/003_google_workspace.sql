-- ============================================================================
-- 003 — Google Workspace: levantamento para migração ao Microsoft 365.
-- Idempotente (só cria o que não existe). Gravado por job/google/*.ps1; a coleta
-- usa dbo.execution_history como as de Microsoft 365 (mesmo execution_id do portal).
-- ============================================================================

IF OBJECT_ID('dbo.g_domains', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_domains (
        id            BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_domains PRIMARY KEY,
        execution_id  NVARCHAR(64)  NOT NULL,
        domain_name   NVARCHAR(256) NOT NULL,
        is_primary    BIT           NULL,
        verified      BIT           NULL,
        is_alias      BIT           NULL,       -- alias de domínio (domainAliases)
        parent_domain NVARCHAR(256) NULL
    );
    CREATE INDEX IX_g_domains_exec ON dbo.g_domains (execution_id);
END
GO

IF OBJECT_ID('dbo.g_orgunits', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_orgunits (
        id            BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_orgunits PRIMARY KEY,
        execution_id  NVARCHAR(64)   NOT NULL,
        org_unit_path NVARCHAR(512)  NOT NULL,
        name          NVARCHAR(256)  NULL,
        parent_path   NVARCHAR(512)  NULL,
        description   NVARCHAR(1024) NULL
    );
    CREATE INDEX IX_g_orgunits_exec ON dbo.g_orgunits (execution_id);
END
GO

IF OBJECT_ID('dbo.g_users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_users (
        id                       BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_users PRIMARY KEY,
        execution_id             NVARCHAR(64)   NOT NULL,
        user_id                  NVARCHAR(64)   NULL,
        primary_email            NVARCHAR(320)  NOT NULL,
        full_name                NVARCHAR(256)  NULL,
        org_unit_path            NVARCHAR(512)  NULL,
        suspended                BIT            NULL,
        archived                 BIT            NULL,
        is_admin                 BIT            NULL,
        is_delegated_admin       BIT            NULL,
        is_2sv_enrolled          BIT            NULL,
        is_2sv_enforced          BIT            NULL,
        created_at               DATETIME2      NULL,
        last_login               DATETIME2      NULL,
        aliases_count            INT            NULL,
        aliases                  NVARCHAR(MAX)  NULL,
        -- relatórios de uso (Reports API, data report_date)
        gmail_mb                 BIGINT         NULL,
        drive_mb                 BIGINT         NULL,
        photos_mb                BIGINT         NULL,
        used_quota_mb            BIGINT         NULL,
        total_quota_mb           BIGINT         NULL,
        gmail_last_activity      DATETIME2      NULL,
        drive_last_activity      DATETIME2      NULL,
        drive_items_owned        BIGINT         NULL,
        drive_items_external     BIGINT         NULL,   -- compartilhados fora do domínio
        drive_items_anyone_link  BIGINT         NULL,   -- "qualquer pessoa com o link"
        report_date              DATE           NULL
    );
    CREATE INDEX IX_g_users_exec ON dbo.g_users (execution_id, primary_email);
END
GO

IF OBJECT_ID('dbo.g_groups', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_groups (
        id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_groups PRIMARY KEY,
        execution_id   NVARCHAR(64)   NOT NULL,
        email          NVARCHAR(320)  NOT NULL,
        name           NVARCHAR(256)  NULL,
        direct_members BIGINT         NULL,
        aliases_count  INT            NULL,
        description    NVARCHAR(2048) NULL
    );
    CREATE INDEX IX_g_groups_exec ON dbo.g_groups (execution_id);
END
GO

IF OBJECT_ID('dbo.g_licenses', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_licenses (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_licenses PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        product_id   NVARCHAR(64)  NULL,
        sku_id       NVARCHAR(64)  NULL,
        sku_name     NVARCHAR(256) NULL,
        user_email   NVARCHAR(320) NULL
    );
    CREATE INDEX IX_g_licenses_exec ON dbo.g_licenses (execution_id);
END
GO

IF OBJECT_ID('dbo.g_resources', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_resources (
        id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_resources PRIMARY KEY,
        execution_id   NVARCHAR(64)  NOT NULL,
        resource_email NVARCHAR(320) NULL,
        name           NVARCHAR(256) NULL,
        resource_type  NVARCHAR(128) NULL,
        category       NVARCHAR(64)  NULL,      -- CONFERENCE_ROOM | OTHER
        capacity       INT           NULL,
        building_id    NVARCHAR(128) NULL
    );
    CREATE INDEX IX_g_resources_exec ON dbo.g_resources (execution_id);
END
GO

IF OBJECT_ID('dbo.g_devices', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.g_devices (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_g_devices PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        device_kind  NVARCHAR(16)  NOT NULL,     -- mobile | chromeos
        device_id    NVARCHAR(128) NULL,
        model        NVARCHAR(256) NULL,
        os           NVARCHAR(256) NULL,
        owner_email  NVARCHAR(320) NULL,
        status       NVARCHAR(64)  NULL,
        last_sync    DATETIME2     NULL
    );
    CREATE INDEX IX_g_devices_exec ON dbo.g_devices (execution_id);
END
GO
