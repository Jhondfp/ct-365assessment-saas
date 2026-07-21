-- ======================================
-- CONTROL PLANE SCHEMA — Metadados Centrais
-- ======================================
-- Este banco é multi-tenant, mas guarda APENAS metadados.
-- Nenhum dado de SharePoint/OneDrive fica aqui.

-- ======================================
-- 01. CLIENTES
-- ======================================
CREATE TABLE [dbo].[clients] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [razao_social] NVARCHAR(255) NOT NULL,
    [cnpj] VARCHAR(14) NOT NULL UNIQUE,
    [email_contato] NVARCHAR(255) NOT NULL,
    [status] VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ([status] IN ('active', 'suspended', 'terminated')),
    [regiao] VARCHAR(20) DEFAULT 'brazilsouth',
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [encerrado_em] DATETIME2 NULL
);

CREATE INDEX [idx_clients_status] ON [dbo].[clients]([status]);
CREATE INDEX [idx_clients_cnpj] ON [dbo].[clients]([cnpj]);

-- ======================================
-- 02. TENANTS (M365 de cada cliente)
-- ======================================
CREATE TABLE [dbo].[tenants] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [m365_tenant_id] NVARCHAR(36) NOT NULL UNIQUE,
    [spo_domain] NVARCHAR(255) NOT NULL, -- contoso.sharepoint.com
    [app_registration_id] UNIQUEIDENTIFIER NOT NULL,
    [key_vault_uri] NVARCHAR(255) NOT NULL, -- https://tenant-kv.vault.azure.net
    [sql_server] NVARCHAR(255) NOT NULL,   -- tenant.database.windows.net
    [sql_database] NVARCHAR(128) NOT NULL, -- ct_tenant_xxx
    [regiao] VARCHAR(20) NOT NULL DEFAULT 'brazilsouth',
    [status] VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ([status] IN ('active', 'provisioning', 'suspended', 'deprovisioning')),
    [sso_consentido_em] DATETIME2 NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [encerrado_em] DATETIME2 NULL,
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_tenants_client_id] ON [dbo].[tenants]([client_id]);
CREATE INDEX [idx_tenants_status] ON [dbo].[tenants]([status]);
CREATE INDEX [idx_tenants_m365_tenant_id] ON [dbo].[tenants]([m365_tenant_id]);

-- ======================================
-- 03. EXECUÇÕES
-- ======================================
CREATE TABLE [dbo].[executions] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [tenant_id] UNIQUEIDENTIFIER NOT NULL,
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [iniciado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [finalizado_em] DATETIME2 NULL,
    [status] VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK ([status] IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    [disparado_por] UNIQUEIDENTIFIER NOT NULL, -- referência a [users]
    [container_instance_id] NVARCHAR(255) NULL, -- para rastreamento do job
    [mensagem_erro] NVARCHAR(MAX) NULL,
    [custo_estimado] DECIMAL(10, 2) NULL,
    [custo_real] DECIMAL(10, 2) NULL,
    [tempo_execucao_segundos] INT NULL,
    [tags_finops] NVARCHAR(MAX) NULL, -- JSON: {gb_analisado, sites_visitados, taxa_compressao}
    FOREIGN KEY ([tenant_id]) REFERENCES [dbo].[tenants]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([disparado_por]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [idx_executions_tenant_id] ON [dbo].[executions]([tenant_id]);
CREATE INDEX [idx_executions_client_id] ON [dbo].[executions]([client_id]);
CREATE INDEX [idx_executions_status] ON [dbo].[executions]([status]);
CREATE INDEX [idx_executions_iniciado_em] ON [dbo].[executions]([iniciado_em]);

-- ======================================
-- 04. USUÁRIOS (Painel administrativo)
-- ======================================
CREATE TABLE [dbo].[users] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [entra_object_id] UNIQUEIDENTIFIER NOT NULL UNIQUE,
    [nome] NVARCHAR(255) NOT NULL,
    [email] NVARCHAR(255) NOT NULL UNIQUE,
    [papel] VARCHAR(20) NOT NULL DEFAULT 'viewer'
        CHECK ([papel] IN ('superadmin', 'analista', 'viewer', 'viewer_cliente')),
    [clientes_atribuidos] NVARCHAR(MAX) NULL, -- JSON array de client_ids
    [ativo] BIT NOT NULL DEFAULT 1,
    [ultimo_acesso] DATETIME2 NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_users_email] ON [dbo].[users]([email]);
CREATE INDEX [idx_users_papel] ON [dbo].[users]([papel]);

-- ======================================
-- 05. AUDIT LOG (Imutável)
-- ======================================
CREATE TABLE [dbo].[audit_log] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [user_id] UNIQUEIDENTIFIER NOT NULL,
    [acao] VARCHAR(50) NOT NULL, -- create_client, update_tenant, start_execution, etc
    [alvo_tipo] VARCHAR(30) NOT NULL, -- client, tenant, execution, user
    [alvo_id] UNIQUEIDENTIFIER NOT NULL,
    [detalhes_json] NVARCHAR(MAX) NULL, -- contexto da ação
    [endereco_ip] VARCHAR(45) NULL,
    [user_agent] NVARCHAR(MAX) NULL,
    [quando] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [idx_audit_log_user_id] ON [dbo].[audit_log]([user_id]);
CREATE INDEX [idx_audit_log_alvo_tipo_id] ON [dbo].[audit_log]([alvo_tipo], [alvo_id]);
CREATE INDEX [idx_audit_log_quando] ON [dbo].[audit_log]([quando]);

-- ======================================
-- 06. JOBS / FILAS (Orquestração)
-- ======================================
CREATE TABLE [dbo].[job_queue] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [execution_id] UNIQUEIDENTIFIER NOT NULL UNIQUE,
    [status] VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK ([status] IN ('pending', 'assigned', 'running', 'completed', 'failed', 'retrying')),
    [tentativas] INT DEFAULT 0,
    [max_tentativas] INT DEFAULT 3,
    [prioridade] INT DEFAULT 0, -- maior = mais urgente
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atribuido_em] DATETIME2 NULL,
    [completo_em] DATETIME2 NULL,
    [proxima_tentativa_em] DATETIME2 NULL,
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_job_queue_status] ON [dbo].[job_queue]([status]);
CREATE INDEX [idx_job_queue_prioridade] ON [dbo].[job_queue]([prioridade] DESC, [criado_em]);

-- ======================================
-- 07. POLICIES (Configurações por Cliente)
-- ======================================
CREATE TABLE [dbo].[policies] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [tenant_id] UNIQUEIDENTIFIER NOT NULL,
    [tipo] VARCHAR(50) NOT NULL, -- max_execution_time, cpu_limit, memory_limit, etc
    [valor] NVARCHAR(MAX) NOT NULL,
    [ativo] BIT NOT NULL DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([tenant_id]) REFERENCES [dbo].[tenants]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_policies_tenant_id] ON [dbo].[policies]([tenant_id]);

-- ======================================
-- STORED PROCEDURES ÚTEIS
-- ======================================

-- Procedure: Criar novo tenant com onboarding
CREATE PROCEDURE [dbo].[sp_CreateTenant]
    @ClientId UNIQUEIDENTIFIER,
    @M365TenantId NVARCHAR(36),
    @SpoDomain NVARCHAR(255),
    @AppRegistrationId UNIQUEIDENTIFIER,
    @KeyVaultUri NVARCHAR(255),
    @SqlServer NVARCHAR(255),
    @SqlDatabase NVARCHAR(128),
    @Regiao VARCHAR(20) = 'brazilsouth'
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @NewTenantId UNIQUEIDENTIFIER = NEWID();

    INSERT INTO [dbo].[tenants]
        ([id], [client_id], [m365_tenant_id], [spo_domain], [app_registration_id],
         [key_vault_uri], [sql_server], [sql_database], [regiao], [status])
    VALUES
        (@NewTenantId, @ClientId, @M365TenantId, @SpoDomain, @AppRegistrationId,
         @KeyVaultUri, @SqlServer, @SqlDatabase, @Regiao, 'provisioning');

    SELECT @NewTenantId AS [tenant_id];
END;

-- Procedure: Encerrar tenant (LGPD - direito ao esquecimento)
CREATE PROCEDURE [dbo].[sp_TerminateTenant]
    @TenantId UNIQUEIDENTIFIER,
    @MotivoCancelamento NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [dbo].[tenants]
    SET [status] = 'deprovisioning',
        [encerrado_em] = GETUTCDATE(),
        [atualizado_em] = GETUTCDATE()
    WHERE [id] = @TenantId;

    -- Nota: O job de deprovisioning vai:
    -- 1. Dropar o database isolado
    -- 2. Deletar o Key Vault
    -- 3. Limpar os registros aqui após confirmação
END;
