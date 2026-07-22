-- ======================================
-- MIGRATIONS: Histórico, Email, PDF, Customização
-- ======================================

-- ======================================
-- 01. EXECUTION SNAPSHOTS - Versionamento de Execuções
-- ======================================
CREATE TABLE [dbo].[execution_snapshots] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [version_number] INT NOT NULL,
    [snapshot_data] NVARCHAR(MAX) NOT NULL, -- JSON completo da execução
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id]) ON DELETE CASCADE,
    UNIQUE ([execution_id], [version_number])
);

CREATE INDEX [idx_execution_snapshots_execution_id] ON [dbo].[execution_snapshots]([execution_id]);
CREATE INDEX [idx_execution_snapshots_version] ON [dbo].[execution_snapshots]([execution_id], [version_number]);

-- ======================================
-- 02. EMAIL QUEUE - Fila de Emails
-- ======================================
CREATE TABLE [dbo].[email_queue] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [recipient_email] NVARCHAR(255) NOT NULL,
    [assunto] NVARCHAR(255) NOT NULL,
    [corpo_html] NVARCHAR(MAX) NOT NULL,
    [status] VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK ([status] IN ('pending', 'sent', 'failed', 'bounced')),
    [tentativas] INT DEFAULT 0,
    [max_tentativas] INT DEFAULT 5,
    [mensagem_erro] NVARCHAR(MAX) NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [enviado_em] DATETIME2 NULL,
    [proxima_tentativa_em] DATETIME2 NULL,
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_email_queue_status] ON [dbo].[email_queue]([status]);
CREATE INDEX [idx_email_queue_execution_id] ON [dbo].[email_queue]([execution_id]);
CREATE INDEX [idx_email_queue_criado_em] ON [dbo].[email_queue]([criado_em]);

-- ======================================
-- 03. PDF STORAGE - Cache de PDFs Gerados
-- ======================================
CREATE TABLE [dbo].[pdf_reports] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [blob_url] NVARCHAR(MAX) NOT NULL, -- URL do Azure Blob Storage
    [blob_sas_token] NVARCHAR(MAX) NULL, -- Token SAS para acesso público
    [tamanho_bytes] BIGINT NULL,
    [hash_md5] VARCHAR(32) NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [expira_em] DATETIME2 NULL, -- Quando o SAS expira
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id]) ON DELETE CASCADE,
    UNIQUE ([execution_id])
);

CREATE INDEX [idx_pdf_reports_execution_id] ON [dbo].[pdf_reports]([execution_id]);
CREATE INDEX [idx_pdf_reports_criado_em] ON [dbo].[pdf_reports]([criado_em]);

-- ======================================
-- 04. EXECUTION TEMPLATES - Templates de Customização
-- ======================================
CREATE TABLE [dbo].[execution_templates] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [tenant_id] UNIQUEIDENTIFIER NOT NULL,
    [template_nome] NVARCHAR(255) NOT NULL,
    [descricao] NVARCHAR(MAX) NULL,
    [config_json] NVARCHAR(MAX) NOT NULL, -- { includeDeleted, maxFileSize, scanExternalShares, etc }
    [criado_por] UNIQUEIDENTIFIER NOT NULL,
    [ativo] BIT NOT NULL DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([tenant_id]) REFERENCES [dbo].[tenants]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([criado_por]) REFERENCES [dbo].[users]([id]),
    UNIQUE ([tenant_id], [template_nome])
);

CREATE INDEX [idx_execution_templates_tenant_id] ON [dbo].[execution_templates]([tenant_id]);
CREATE INDEX [idx_execution_templates_ativo] ON [dbo].[execution_templates]([ativo]);

-- ======================================
-- 05. ADICIONAR COLUNAS À EXECUTIONS
-- ======================================
-- Versioning
ALTER TABLE [dbo].[executions]
ADD [version_number] INT NULL; -- Auto-incremento por tenant

-- Configuração utilizada
ALTER TABLE [dbo].[executions]
ADD [config_json] NVARCHAR(MAX) NULL; -- Cópia da config utilizada na execução

-- Template usado (audit trail)
ALTER TABLE [dbo].[executions]
ADD [execution_template_id] UNIQUEIDENTIFIER NULL;

-- Resultado/Findings
ALTER TABLE [dbo].[executions]
ADD [findings_json] NVARCHAR(MAX) NULL; -- Resultados estruturados

-- SharePoint sites analisados
ALTER TABLE [dbo].[executions]
ADD [sites_analisados] NVARCHAR(MAX) NULL; -- JSON array de site URLs

-- GB processado
ALTER TABLE [dbo].[executions]
ADD [gb_processado] DECIMAL(10, 2) NULL;

ALTER TABLE [dbo].[executions]
ADD FOREIGN KEY ([execution_template_id]) REFERENCES [dbo].[execution_templates]([id]);

-- ======================================
-- STORED PROCEDURES
-- ======================================

-- Procedure: Salvar Snapshot de Execução (para histórico)
CREATE PROCEDURE [dbo].[sp_SaveExecutionSnapshot]
    @ExecutionId UNIQUEIDENTIFIER,
    @SnapshotData NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @VersionNumber INT;

    -- Calcular próxima versão
    SELECT @VersionNumber = ISNULL(MAX([version_number]), 0) + 1
    FROM [dbo].[execution_snapshots]
    WHERE [execution_id] = @ExecutionId;

    INSERT INTO [dbo].[execution_snapshots]
        ([execution_id], [version_number], [snapshot_data])
    VALUES
        (@ExecutionId, @VersionNumber, @SnapshotData);

    -- Atualizar version_number na execution
    UPDATE [dbo].[executions]
    SET [version_number] = @VersionNumber
    WHERE [id] = @ExecutionId;

    SELECT @VersionNumber AS [version_number];
END;

-- Procedure: Enfileirar Email
CREATE PROCEDURE [dbo].[sp_EnqueueEmail]
    @ExecutionId UNIQUEIDENTIFIER,
    @RecipientEmail NVARCHAR(255),
    @Assunto NVARCHAR(255),
    @CorpoHtml NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [dbo].[email_queue]
        ([execution_id], [recipient_email], [assunto], [corpo_html], [status])
    VALUES
        (@ExecutionId, @RecipientEmail, @Assunto, @CorpoHtml, 'pending');

    SELECT SCOPE_IDENTITY() AS [queue_id];
END;

-- Procedure: Registrar PDF Gerado
CREATE PROCEDURE [dbo].[sp_RegisterPdfReport]
    @ExecutionId UNIQUEIDENTIFIER,
    @BlobUrl NVARCHAR(MAX),
    @BlobSasToken NVARCHAR(MAX),
    @TamanhoBytes BIGINT,
    @HashMd5 VARCHAR(32),
    @ExpiresAt DATETIME2
AS
BEGIN
    SET NOCOUNT ON;

    -- Remover PDF anterior se existir
    DELETE FROM [dbo].[pdf_reports]
    WHERE [execution_id] = @ExecutionId;

    INSERT INTO [dbo].[pdf_reports]
        ([execution_id], [blob_url], [blob_sas_token], [tamanho_bytes], [hash_md5], [expira_em])
    VALUES
        (@ExecutionId, @BlobUrl, @BlobSasToken, @TamanhoBytes, @HashMd5, @ExpiresAt);
END;

-- Procedure: Comparar Snapshots (helper para delta)
CREATE PROCEDURE [dbo].[sp_CompareSnapshots]
    @ExecutionId UNIQUEIDENTIFIER,
    @Version1 INT,
    @Version2 INT
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        s1.[version_number] AS [v1],
        s2.[version_number] AS [v2],
        s1.[snapshot_data] AS [data_v1],
        s2.[snapshot_data] AS [data_v2],
        s1.[criado_em] AS [created_v1],
        s2.[criado_em] AS [created_v2]
    FROM [dbo].[execution_snapshots] s1
    INNER JOIN [dbo].[execution_snapshots] s2
        ON s1.[execution_id] = s2.[execution_id]
    WHERE s1.[execution_id] = @ExecutionId
        AND s1.[version_number] = @Version1
        AND s2.[version_number] = @Version2;
END;
