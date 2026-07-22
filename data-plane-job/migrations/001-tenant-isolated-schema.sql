-- ======================================
-- TENANT ISOLATED DATABASE SCHEMA
-- ======================================
-- Este script é executado NO BANCO DO TENANT (não no Control Plane)
-- Deve ser executado uma vez por tenant durante provisioning

-- ======================================
-- 01. SITES (SharePoint Sites)
-- ======================================
CREATE TABLE [dbo].[spo_sites] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [site_id] NVARCHAR(255) NOT NULL UNIQUE,
    [display_name] NVARCHAR(255) NOT NULL,
    [web_url] NVARCHAR(2048) NOT NULL,
    [description] NVARCHAR(MAX) NULL,
    [created_at] DATETIME2 NOT NULL,
    [last_modified] DATETIME2 NULL,
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_spo_sites_web_url] ON [dbo].[spo_sites]([web_url]);

-- ======================================
-- 02. DRIVES (Document Libraries)
-- ======================================
CREATE TABLE [dbo].[spo_drives] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [site_id] UNIQUEIDENTIFIER NOT NULL,
    [drive_id] NVARCHAR(255) NOT NULL,
    [display_name] NVARCHAR(255) NOT NULL,
    [web_url] NVARCHAR(2048) NOT NULL,
    [total_size_bytes] BIGINT NULL,
    [file_count] INT NULL,
    [folder_count] INT NULL,
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([site_id]) REFERENCES [dbo].[spo_sites]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_spo_drives_site_id] ON [dbo].[spo_drives]([site_id]);

-- ======================================
-- 03. FILES (Documentos)
-- ======================================
CREATE TABLE [dbo].[spo_files] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [drive_id] UNIQUEIDENTIFIER NOT NULL,
    [file_id] NVARCHAR(255) NOT NULL,
    [file_name] NVARCHAR(255) NOT NULL,
    [file_extension] VARCHAR(10) NULL,
    [size_bytes] BIGINT NOT NULL,
    [created_at] DATETIME2 NOT NULL,
    [last_modified] DATETIME2 NULL,
    [created_by] NVARCHAR(255) NULL,
    [web_url] NVARCHAR(2048) NULL,
    [is_shared] BIT DEFAULT 0,
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([drive_id]) REFERENCES [dbo].[spo_drives]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_spo_files_drive_id] ON [dbo].[spo_files]([drive_id]);
CREATE INDEX [idx_spo_files_extension] ON [dbo].[spo_files]([file_extension]);
CREATE INDEX [idx_spo_files_size] ON [dbo].[spo_files]([size_bytes]);

-- ======================================
-- 04. FOLDERS (Pastas)
-- ======================================
CREATE TABLE [dbo].[spo_folders] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [drive_id] UNIQUEIDENTIFIER NOT NULL,
    [folder_id] NVARCHAR(255) NOT NULL,
    [folder_name] NVARCHAR(255) NOT NULL,
    [item_count] INT NULL,
    [created_at] DATETIME2 NOT NULL,
    [last_modified] DATETIME2 NULL,
    [web_url] NVARCHAR(2048) NULL,
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([drive_id]) REFERENCES [dbo].[spo_drives]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_spo_folders_drive_id] ON [dbo].[spo_folders]([drive_id]);

-- ======================================
-- 05. ONEDRIVE (Users Personal Drives)
-- ======================================
CREATE TABLE [dbo].[od_users] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [user_id] NVARCHAR(255) NOT NULL UNIQUE,
    [display_name] NVARCHAR(255) NOT NULL,
    [mail] NVARCHAR(255) NULL,
    [drive_id] NVARCHAR(255) NOT NULL,
    [web_url] NVARCHAR(2048) NOT NULL,
    [quota_used_bytes] BIGINT NULL,
    [quota_total_bytes] BIGINT NULL,
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_od_users_mail] ON [dbo].[od_users]([mail]);

-- ======================================
-- 06. ONEDRIVE FILES
-- ======================================
CREATE TABLE [dbo].[od_files] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [file_id] NVARCHAR(255) NOT NULL,
    [file_name] NVARCHAR(255) NOT NULL,
    [file_extension] VARCHAR(10) NULL,
    [size_bytes] BIGINT NOT NULL,
    [created_at] DATETIME2 NOT NULL,
    [last_modified] DATETIME2 NULL,
    [is_shared] BIT DEFAULT 0,
    [shared_scope] VARCHAR(20) NULL, -- 'internal', 'external', 'anonymous'
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[od_users]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_od_files_user_id] ON [dbo].[od_files]([user_id]);
CREATE INDEX [idx_od_files_extension] ON [dbo].[od_files]([file_extension]);

-- ======================================
-- 07. FINDINGS (Achados / Riscos)
-- ======================================
CREATE TABLE [dbo].[findings] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [finding_type] VARCHAR(50) NOT NULL,
    [title] NVARCHAR(255) NOT NULL,
    [description] NVARCHAR(MAX) NOT NULL,
    [severity] VARCHAR(20) NOT NULL CHECK ([severity] IN ('high', 'medium', 'low')),
    [impact] NVARCHAR(MAX) NULL,
    [recommendation] NVARCHAR(MAX) NULL,
    [affected_count] INT NULL,
    [affected_resources] NVARCHAR(MAX) NULL, -- JSON array
    [status] VARCHAR(20) DEFAULT 'open' CHECK ([status] IN ('open', 'reviewed', 'remediated')),
    [created_at] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_findings_severity] ON [dbo].[findings]([severity]);
CREATE INDEX [idx_findings_status] ON [dbo].[findings]([status]);

-- ======================================
-- 08. COLLECTION_LOGS (Auditoria)
-- ======================================
CREATE TABLE [dbo].[collection_logs] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [collection_type] VARCHAR(50) NOT NULL, -- 'sharepoint', 'onedrive', 'full'
    [status] VARCHAR(20) NOT NULL DEFAULT 'started' CHECK ([status] IN ('started', 'in_progress', 'completed', 'failed')),
    [total_sites] INT NULL,
    [total_drives] INT NULL,
    [total_files] INT NULL,
    [total_users] INT NULL,
    [total_size_gb] DECIMAL(15, 2) NULL,
    [total_findings] INT NULL,
    [error_message] NVARCHAR(MAX) NULL,
    [started_at] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [completed_at] DATETIME2 NULL,
    [duration_seconds] INT NULL
);

CREATE INDEX [idx_collection_logs_status] ON [dbo].[collection_logs]([status]);
CREATE INDEX [idx_collection_logs_started_at] ON [dbo].[collection_logs]([started_at]);

-- ======================================
-- SUMMARY VIEWS
-- ======================================

-- View: SharePoint Summary
CREATE VIEW [dbo].[vw_spo_summary] AS
SELECT
    COUNT(DISTINCT s.id) as site_count,
    COUNT(DISTINCT d.id) as drive_count,
    COUNT(DISTINCT f.id) as file_count,
    SUM(f.size_bytes) as total_size_bytes,
    SUM(CASE WHEN f.is_shared = 1 THEN 1 ELSE 0 END) as shared_file_count,
    MAX(cl.completed_at) as last_collection_time
FROM [dbo].[spo_sites] s
LEFT JOIN [dbo].[spo_drives] d ON s.id = d.site_id
LEFT JOIN [dbo].[spo_files] f ON d.id = f.drive_id
LEFT JOIN [dbo].[collection_logs] cl ON cl.collection_type = 'sharepoint' AND cl.status = 'completed'
;

-- View: OneDrive Summary
CREATE VIEW [dbo].[vw_od_summary] AS
SELECT
    COUNT(DISTINCT u.id) as user_count,
    COUNT(DISTINCT f.id) as file_count,
    SUM(f.size_bytes) as total_size_bytes,
    SUM(u.quota_used_bytes) as total_quota_used,
    SUM(CASE WHEN f.is_shared = 1 THEN 1 ELSE 0 END) as shared_file_count,
    MAX(cl.completed_at) as last_collection_time
FROM [dbo].[od_users] u
LEFT JOIN [dbo].[od_files] f ON u.id = f.user_id
LEFT JOIN [dbo].[collection_logs] cl ON cl.collection_type = 'onedrive' AND cl.status = 'completed'
;

-- View: File Type Distribution
CREATE VIEW [dbo].[vw_file_types] AS
SELECT
    COALESCE(spo.file_extension, od.file_extension, 'unknown') as extension,
    COUNT(spo.id) as spo_count,
    COUNT(od.id) as od_count,
    SUM(spo.size_bytes) as spo_size_bytes,
    SUM(od.size_bytes) as od_size_bytes
FROM
    (SELECT file_extension, size_bytes, id FROM [dbo].[spo_files]) spo
FULL OUTER JOIN
    (SELECT file_extension, size_bytes, id FROM [dbo].[od_files]) od
    ON spo.file_extension = od.file_extension
GROUP BY COALESCE(spo.file_extension, od.file_extension, 'unknown')
ORDER BY spo_size_bytes + od_size_bytes DESC
;

-- ======================================
-- STORED PROCEDURES
-- ======================================

-- Procedure: Insert SharePoint Site
CREATE PROCEDURE [dbo].[sp_InsertSPOSite]
    @SiteId NVARCHAR(255),
    @DisplayName NVARCHAR(255),
    @WebUrl NVARCHAR(2048),
    @Description NVARCHAR(MAX) = NULL,
    @CreatedAt DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Id UNIQUEIDENTIFIER = NEWID();

    INSERT INTO [dbo].[spo_sites]
        ([id], [site_id], [display_name], [web_url], [description], [created_at])
    VALUES
        (@Id, @SiteId, @DisplayName, @WebUrl, @Description, @CreatedAt);

    SELECT @Id as [site_id];
END;

-- Procedure: Insert SharePoint Files (Batch)
CREATE PROCEDURE [dbo].[sp_InsertSPOFiles]
    @DriveId UNIQUEIDENTIFIER,
    @FilesJson NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- Parse JSON e insert
    INSERT INTO [dbo].[spo_files]
        ([id], [drive_id], [file_id], [file_name], [file_extension], [size_bytes],
         [created_at], [last_modified], [created_by], [web_url], [is_shared])
    SELECT
        NEWID(),
        @DriveId,
        JSON_VALUE(value, '$.id'),
        JSON_VALUE(value, '$.name'),
        JSON_VALUE(value, '$.extension'),
        JSON_VALUE(value, '$.size'),
        JSON_VALUE(value, '$.created'),
        JSON_VALUE(value, '$.modified'),
        JSON_VALUE(value, '$.createdBy'),
        JSON_VALUE(value, '$.webUrl'),
        0
    FROM OPENJSON(@FilesJson);

    SELECT @@ROWCOUNT as [inserted_count];
END;

-- Procedure: Get Summary Report
CREATE PROCEDURE [dbo].[sp_GetSummaryReport]
AS
BEGIN
    SET NOCOUNT ON;

    SELECT 'SharePoint' as source, * FROM [dbo].[vw_spo_summary]
    UNION ALL
    SELECT 'OneDrive' as source, * FROM [dbo].[vw_od_summary];
END;
