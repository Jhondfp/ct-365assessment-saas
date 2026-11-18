-- ============================================================================
-- CT Cloud Target Assessment - Schema completo SQL Server
-- ============================================================================
-- Script UNICO de setup: tabelas base, tabelas de pre-agregacao, indexes de
-- performance e todas as stored procedures usadas pelo dashboard (Start-Monitor.ps1).
--
-- ATENCAO: este script faz DROP + CREATE de TUDO (tabelas, indexes e procedures).
-- Isso apaga todos os dados existentes. Execute apenas em ambiente de
-- desenvolvimento ou numa nova instalacao (ou quando precisar resetar o schema).
--
-- ORDEM DE USO:
--   1. Execute este script uma vez para (re)criar o schema inteiro.
--   2. Rode o assessment (src\main.ps1). Ao final, ele grava o status da
--      execucao em dbo.execution_history e chama automaticamente
--      dbo.sp_RefreshDashboardAggregates para popular as tabelas agg_*.
--   3. O dashboard (Start-Monitor.ps1 -> /dashboard) chama as procedures
--      dbo.sp_dash_* para ler os dados ja agregados (instantaneo mesmo com
--      files_info na casa de centenas de milhoes de linhas).
--
-- Caso precise forcar um refresh manual (ex: apos importar dados por fora do
-- pipeline), execute:  EXEC dbo.sp_RefreshDashboardAggregates;
-- ============================================================================

-- ============================================================================
-- 0. DROP — ordem: procedures -> tabelas de agregacao -> tabelas base
-- ============================================================================

-- ── Procedures do dashboard ─────────────────────────────────────────────────
IF OBJECT_ID('dbo.sp_RefreshDashboardAggregates', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_RefreshDashboardAggregates;
IF OBJECT_ID('dbo.sp_dash_resolve_execution_id',  'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_resolve_execution_id;
IF OBJECT_ID('dbo.sp_dash_sites_summary',         'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_summary;
IF OBJECT_ID('dbo.sp_dash_files_summary',         'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_files_summary;
IF OBJECT_ID('dbo.sp_dash_file_types',            'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_file_types;
IF OBJECT_ID('dbo.sp_dash_critical_sites',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_critical_sites;
IF OBJECT_ID('dbo.sp_dash_all_sites',              'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_all_sites;
IF OBJECT_ID('dbo.sp_dash_trash_summary',         'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_trash_summary;
IF OBJECT_ID('dbo.sp_dash_executions_list',       'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_executions_list;
IF OBJECT_ID('dbo.sp_dash_lixeira_top_sites',     'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_lixeira_top_sites;
IF OBJECT_ID('dbo.sp_dash_sites_totais',          'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_totais;
IF OBJECT_ID('dbo.sp_dash_sites_por_subsite',     'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_por_subsite;
IF OBJECT_ID('dbo.sp_dash_sites_top',             'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_top;
IF OBJECT_ID('dbo.sp_dash_sites_top_ext',         'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_top_ext;
IF OBJECT_ID('dbo.sp_dash_liberacao_summary',     'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_liberacao_summary;
IF OBJECT_ID('dbo.sp_dash_liberacao_by_site',     'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_liberacao_by_site;
IF OBJECT_ID('dbo.sp_dash_versoes_by_site',       'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_versoes_by_site;
IF OBJECT_ID('dbo.sp_dash_crescimento',           'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_crescimento;
IF OBJECT_ID('dbo.sp_dash_sites_summary_by_type', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_sites_summary_by_type;
IF OBJECT_ID('dbo.sp_dash_files_summary_by_type', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_files_summary_by_type;
IF OBJECT_ID('dbo.sp_dash_trash_summary_by_type', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_trash_summary_by_type;
IF OBJECT_ID('dbo.sp_dash_file_types_by_type',    'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_file_types_by_type;
IF OBJECT_ID('dbo.sp_dash_top_versioned_files',   'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_top_versioned_files;
IF OBJECT_ID('dbo.sp_dash_top_heaviest_files',    'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_top_heaviest_files;
IF OBJECT_ID('dbo.sp_dash_version_savings',       'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_version_savings;
IF OBJECT_ID('dbo.sp_dash_growth_monthly',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_growth_monthly;
IF OBJECT_ID('dbo.sp_dash_duplicate_candidates',  'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_duplicate_candidates;
IF OBJECT_ID('dbo.sp_dash_orphaned_sites',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_orphaned_sites;
IF OBJECT_ID('dbo.sp_dash_intune_summary',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_intune_summary;
IF OBJECT_ID('dbo.sp_dash_intune_by_os',          'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_intune_by_os;
IF OBJECT_ID('dbo.sp_dash_intune_devices',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_intune_devices;
IF OBJECT_ID('dbo.sp_dash_intune_by_ownertype',   'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_intune_by_ownertype;
IF OBJECT_ID('dbo.sp_dash_intune_compliance_failures', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_intune_compliance_failures;
IF OBJECT_ID('dbo.sp_dash_licensing_summary',     'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_licensing_summary;
IF OBJECT_ID('dbo.sp_dash_licensing_by_sku',      'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_licensing_by_sku;
IF OBJECT_ID('dbo.sp_dash_adoption_by_service',   'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_adoption_by_service;
IF OBJECT_ID('dbo.sp_dash_adoption_inactive_users', 'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_adoption_inactive_users;
IF OBJECT_ID('dbo.sp_dash_mailbox_summary',        'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_mailbox_summary;
IF OBJECT_ID('dbo.sp_dash_mailbox_list',           'P') IS NOT NULL DROP PROCEDURE dbo.sp_dash_mailbox_list;
GO

-- ── Tabelas de pre-agregacao ────────────────────────────────────────────────
IF OBJECT_ID('dbo.agg_stale_by_site_year',      'U') IS NOT NULL DROP TABLE dbo.agg_stale_by_site_year;
IF OBJECT_ID('dbo.agg_version_by_site',         'U') IS NOT NULL DROP TABLE dbo.agg_version_by_site;
IF OBJECT_ID('dbo.agg_file_types',              'U') IS NOT NULL DROP TABLE dbo.agg_file_types;
IF OBJECT_ID('dbo.agg_files_by_owner',          'U') IS NOT NULL DROP TABLE dbo.agg_files_by_owner;
IF OBJECT_ID('dbo.agg_duplicate_candidates',    'U') IS NOT NULL DROP TABLE dbo.agg_duplicate_candidates;
IF OBJECT_ID('dbo.agg_files_by_site',           'U') IS NOT NULL DROP TABLE dbo.agg_files_by_site;
IF OBJECT_ID('dbo.agg_file_types_by_sitetype',  'U') IS NOT NULL DROP TABLE dbo.agg_file_types_by_sitetype;
IF OBJECT_ID('dbo.agg_top_versioned_files',     'U') IS NOT NULL DROP TABLE dbo.agg_top_versioned_files;
IF OBJECT_ID('dbo.agg_top_heaviest_files',      'U') IS NOT NULL DROP TABLE dbo.agg_top_heaviest_files;
IF OBJECT_ID('dbo.agg_growth_monthly',          'U') IS NOT NULL DROP TABLE dbo.agg_growth_monthly;
GO

-- ── Tabelas base (dependentes primeiro) ─────────────────────────────────────
IF OBJECT_ID('dbo.meetings',                  'U') IS NOT NULL DROP TABLE dbo.meetings;
IF OBJECT_ID('dbo.intune_compliance_states',   'U') IS NOT NULL DROP TABLE dbo.intune_compliance_states;
IF OBJECT_ID('dbo.intune_devices',             'U') IS NOT NULL DROP TABLE dbo.intune_devices;
IF OBJECT_ID('dbo.licensing_info',    'U') IS NOT NULL DROP TABLE dbo.licensing_info;
IF OBJECT_ID('dbo.user_activity',     'U') IS NOT NULL DROP TABLE dbo.user_activity;
IF OBJECT_ID('dbo.mailbox_info',      'U') IS NOT NULL DROP TABLE dbo.mailbox_info;
IF OBJECT_ID('dbo.files_info',        'U') IS NOT NULL DROP TABLE dbo.files_info;
IF OBJECT_ID('dbo.trash_items',       'U') IS NOT NULL DROP TABLE dbo.trash_items;
IF OBJECT_ID('dbo.sites_info',        'U') IS NOT NULL DROP TABLE dbo.sites_info;
IF OBJECT_ID('dbo.execution_logs',    'U') IS NOT NULL DROP TABLE dbo.execution_logs;
IF OBJECT_ID('dbo.execution_history', 'U') IS NOT NULL DROP TABLE dbo.execution_history;
IF OBJECT_ID('dbo.site_owner_status', 'U') IS NOT NULL DROP TABLE dbo.site_owner_status;
IF OBJECT_ID('dbo.execution_progress','U') IS NOT NULL DROP TABLE dbo.execution_progress;
GO

-- ============================================================================
-- 1. TABELAS BASE
-- ============================================================================

-- ── execution_history ───────────────────────────────────────────────────────
-- Populada por src\main.ps1 (Start-ExecutionHistory / Complete-ExecutionHistory
-- em Repository.ps1): uma linha por execucao do assessment, status
-- running -> completed | failed.

CREATE TABLE dbo.execution_history (
    execution_id           NVARCHAR(64)  NOT NULL,
    start_time             DATETIME2     NOT NULL,
    end_time               DATETIME2     NULL,
    status                 NVARCHAR(32)  NOT NULL,
    machine_name           NVARCHAR(128) NULL,
    user_name              NVARCHAR(128) NULL,
    total_sites_processed  INT           NULL,
    total_files_processed  BIGINT        NULL,
    -- Cota real do tenant (Get-PnPTenant, 1 chamada por execucao) - NAO e o
    -- StorageQuota por site de Get-PnPTenantSite, que sob gestao automatica
    -- de cota reflete um teto de provisionamento por site, nao a capacidade
    -- total contratada. Ver src/modules/Get-SitesInfo.ps1.
    tenant_storage_quota_mb BIGINT       NULL,
    CONSTRAINT PK_execution_history PRIMARY KEY (execution_id)
);
GO

-- ── execution_logs ───────────────────────────────────────────────────────────

CREATE TABLE dbo.execution_logs (
    id                BIGINT IDENTITY(1,1) NOT NULL,
    execution_id      NVARCHAR(64)    NOT NULL,
    log_time          DATETIME2       NOT NULL,
    log_level         NVARCHAR(16)    NOT NULL,
    module_name       NVARCHAR(64)    NOT NULL,
    site_url          NVARCHAR(512)   NULL,
    message           NVARCHAR(MAX)   NOT NULL,
    exception_details NVARCHAR(MAX)   NULL,
    thread_id         INT             NULL,
    CONSTRAINT PK_execution_logs PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_logs_exec ON dbo.execution_logs (execution_id);
CREATE NONCLUSTERED INDEX IX_logs_time ON dbo.execution_logs (log_time DESC);
GO

-- ── sites_info ───────────────────────────────────────────────────────────────

CREATE TABLE dbo.sites_info (
    id                            BIGINT IDENTITY(1,1) NOT NULL,
    execution_id                  NVARCHAR(64)   NOT NULL,
    site_id                       NVARCHAR(128)  NULL,
    site_title                    NVARCHAR(256)  NULL,
    site_url                      NVARCHAR(512)  NULL,
    site_type                     NVARCHAR(64)   NULL,
    web_root_url                  NVARCHAR(512)  NULL,
    administrators                NVARCHAR(MAX)  NULL,
    created_date                  DATETIME2      NULL,
    last_modified_date            DATETIME2      NULL,
    storage_used                  BIGINT         NULL,
    storage_quota                 BIGINT         NULL,
    storage_percent_used          DECIMAL(8,2)   NULL,
    site_template                 NVARCHAR(64)   NULL,
    subsites_count                INT            NULL,
    document_library_items_count  BIGINT         NULL,
    sharing_capability            NVARCHAR(64)   NULL,
    is_external_sharing_enabled   BIT            NULL,
    is_teams_connected            BIT            NULL,
    is_teams_channel_connected    BIT            NULL,
    status                        NVARCHAR(32)   NULL,
    CONSTRAINT PK_sites_info PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_sites_exec ON dbo.sites_info (execution_id);
CREATE NONCLUSTERED INDEX IX_sites_url  ON dbo.sites_info (site_url);
GO

-- ── site_owner_status ────────────────────────────────────────────────────────
-- Populada por src\modules\Get-OwnerStatus.ps1: 1 linha por administrador
-- UNICO (nao por site) coletado em sites_info.administrators, checando
-- accountEnabled no Entra ID via Graph. Quando owner_mail e o e-mail de um
-- grupo M365 (sites de grupo/Teams), account_exists=1 e account_enabled
-- indica se o grupo tem ao menos 1 owner habilitado. Usada por sp_dash_orphaned_sites
-- para sinalizar sites cujo(s) administrador(es) estao todos
-- desabilitados/inexistentes.
CREATE TABLE dbo.site_owner_status (
    execution_id    NVARCHAR(64)   NOT NULL,
    owner_mail      NVARCHAR(256)  NOT NULL,
    account_exists  BIT            NOT NULL DEFAULT 0,
    account_enabled BIT            NULL,
    checked_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_site_owner_status PRIMARY KEY (execution_id, owner_mail)
);
GO

-- ── execution_progress ──────────────────────────────────────────────────────
-- Rastreia, por execucao+modulo+site, quais sites ja tiveram sua coleta
-- 100% concluida (flush final incluido). Usada apenas pelos modulos que
-- processam em paralelo por site e podem ser interrompidos no meio
-- (Get-DataFiles.ps1 module_name='files', Get-TrashItems.ps1 module_name='trash',
-- Get-SitesInfo.ps1 module_name='sites'). Uma linha so e gravada quando o
-- site termina com SUCESSO - ausencia de linha = "nao concluido" (nunca
-- comecou OU comecou e nao terminou), exatamente o conjunto que src\main.ps1
-- precisa reprocessar ao retomar uma execucao que ficou com status='running'
-- (ver dbo.execution_history).
-- OBS: site_url aqui e generico, so a chave de trabalho por modulo - para
-- module_name='sites' guarda o site_id (nao a URL), porque em dbo.sites_info
-- o site_url muda entre o site pai e cada subsite, mas o site_id e o mesmo.
--
-- Tambem usada pelos modulos "atomicos" que NAO processam por site (1
-- chamada ao Graph cobre o tenant inteiro): licensing/adoption/intune/
-- meetings/owner_status, via Test-ModuleCompleted/Complete-ModuleProgress
-- (Repository.ps1) - ali site_url e sempre o sentinela fixo '__all__'
-- (o modulo inteiro e "1 unidade de trabalho"), em vez de uma URL real.
CREATE TABLE dbo.execution_progress (
    execution_id NVARCHAR(64)  NOT NULL,
    module_name  NVARCHAR(32)  NOT NULL,
    site_url     NVARCHAR(512) NOT NULL,
    status       NVARCHAR(16)  NOT NULL DEFAULT 'completed',
    updated_at   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_execution_progress PRIMARY KEY (execution_id, module_name, site_url)
);
GO

-- ── files_info ───────────────────────────────────────────────────────────────

CREATE TABLE dbo.files_info (
    id                        BIGINT IDENTITY(1,1) NOT NULL,
    execution_id              NVARCHAR(64)   NOT NULL,
    file_id                   NVARCHAR(64)   NULL,
    file_name                 NVARCHAR(512)  NULL,
    file_size                 BIGINT         NULL,
    total_file_size           BIGINT         NULL,
    versions_count            INT            NULL,
    file_type                 NVARCHAR(32)   NULL,
    file_hash                 NVARCHAR(128)  NULL,
    file_compliance_tag       NVARCHAR(128)  NULL,
    file_sec_classification   NVARCHAR(128)  NULL,
    file_url                  NVARCHAR(MAX)  NULL,
    site_name                 NVARCHAR(256)  NULL,
    site_url                  NVARCHAR(512)  NULL,
    relative_url              NVARCHAR(MAX)  NULL,
    owner_name                NVARCHAR(256)  NULL,
    owner_mail                NVARCHAR(256)  NULL,
    created_date               DATETIME2      NULL,
    last_modified_user        NVARCHAR(256)  NULL,
    last_modified_mail        NVARCHAR(256)  NULL,
    last_modified_date        DATETIME2      NULL,
    is_subsite                BIT            NULL,
    preservation_hold_library BIT            NULL,
    years_without_changes     DECIMAL(8,2)   NULL,
    CONSTRAINT PK_files_info PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_files_exec ON dbo.files_info (execution_id);
CREATE NONCLUSTERED INDEX IX_files_site ON dbo.files_info (site_url);
CREATE NONCLUSTERED INDEX IX_files_type ON dbo.files_info (file_type);
GO

-- ── trash_items ──────────────────────────────────────────────────────────────

CREATE TABLE dbo.trash_items (
    id                BIGINT IDENTITY(1,1) NOT NULL,
    execution_id      NVARCHAR(64)   NOT NULL,
    site_id           NVARCHAR(64)   NULL,
    site_url          NVARCHAR(512)  NULL,
    site_title        NVARCHAR(256)  NULL,
    item_id           NVARCHAR(64)   NULL,
    item_title        NVARCHAR(512)  NULL,
    item_type         NVARCHAR(64)   NULL,
    deleted_by        NVARCHAR(256)  NULL,
    deleted_date      DATETIME2      NULL,
    original_location NVARCHAR(MAX)  NULL,
    size_bytes        BIGINT         NULL,
    item_state        NVARCHAR(32)   NULL,
    CONSTRAINT PK_trash_items PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_trash_exec ON dbo.trash_items (execution_id);
CREATE NONCLUSTERED INDEX IX_trash_exec_site ON dbo.trash_items (execution_id, site_url);
GO

-- ── licensing_info ───────────────────────────────────────────────────────────

CREATE TABLE dbo.licensing_info (
    id              BIGINT IDENTITY(1,1) NOT NULL,
    execution_id    NVARCHAR(64)   NOT NULL,
    sku_id          NVARCHAR(64)   NULL,
    sku_part_number NVARCHAR(128)  NULL,
    friendly_name   NVARCHAR(256)  NULL,
    total_licenses  BIGINT         NULL,
    used_licenses   BIGINT         NULL,
    collected_at    DATETIME2      NULL,
    CONSTRAINT PK_licensing_info PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_lic_exec ON dbo.licensing_info (execution_id);
GO

-- ── user_activity (aba Adoção — Get-ActivityInfo.ps1, Graph Reports API) ────
-- 1 linha por (usuario, servico) por execucao. service: SharePoint | OneDrive
-- | Exchange | Teams. last_activity_date NULL = sem atividade no periodo
-- coletado (D30 - ver Get-ActivityInfo.ps1).
CREATE TABLE dbo.user_activity (
    id                   BIGINT IDENTITY(1,1) NOT NULL,
    execution_id         NVARCHAR(64)   NOT NULL,
    user_principal_name  NVARCHAR(256)  NULL,
    service              NVARCHAR(32)   NOT NULL,
    last_activity_date   DATETIME2      NULL,
    activity_count       BIGINT         NULL,
    is_deleted           BIT            NULL,
    collected_at         DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_user_activity PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_user_activity_exec ON dbo.user_activity (execution_id, service);
GO

-- ── mailbox_info (aba Exchange — Get-MailboxInfo.ps1, Graph Reports API) ────
-- 1 linha por usuario por execucao. storage_used_bytes e sempre a caixa
-- PRINCIPAL/ativa - o Graph Reports API nao expoe o tamanho do archive
-- mailbox, so o indicador has_archive (bit). Ver comentario no topo de
-- Get-MailboxInfo.ps1 para o porque (precisaria de Exchange Online
-- PowerShell, fora do escopo atual).
CREATE TABLE dbo.mailbox_info (
    id                                 BIGINT IDENTITY(1,1) NOT NULL,
    execution_id                       NVARCHAR(64)   NOT NULL,
    user_principal_name                NVARCHAR(256)  NULL,
    display_name                       NVARCHAR(256)  NULL,
    item_count                         BIGINT         NULL,
    storage_used_bytes                 BIGINT         NULL,
    issue_warning_quota_bytes          BIGINT         NULL,
    prohibit_send_quota_bytes          BIGINT         NULL,
    prohibit_send_receive_quota_bytes  BIGINT         NULL,
    deleted_item_count                 BIGINT         NULL,
    deleted_item_size_bytes            BIGINT         NULL,
    has_archive                        BIT            NULL,
    last_activity_date                 DATETIME2      NULL,
    is_deleted                         BIT            NULL,
    collected_at                       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_mailbox_info PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_mailbox_exec ON dbo.mailbox_info (execution_id);
GO

-- ── intune_devices ───────────────────────────────────────────────────────────

CREATE TABLE dbo.intune_devices (
    id                  BIGINT IDENTITY(1,1) NOT NULL,
    execution_id        NVARCHAR(64)   NOT NULL,
    device_id           NVARCHAR(64)   NULL,
    device_name         NVARCHAR(256)  NULL,
    device_type         NVARCHAR(64)   NULL,
    os_type             NVARCHAR(64)   NULL,
    os_version          NVARCHAR(64)   NULL,
    owner_email         NVARCHAR(256)  NULL,
    owner_name          NVARCHAR(256)  NULL,
    compliance_status   NVARCHAR(64)   NULL,
    is_jailbroken       BIT            NULL,
    is_encrypted        BIT            NULL,
    antivirus_status    NVARCHAR(64)   NULL,
    has_compliance_risk BIT            NULL,
    management_agent    NVARCHAR(64)   NULL,
    enrollment_date     DATETIME2      NULL,
    last_checkin_date   DATETIME2      NULL,
    bitlocker_status    NVARCHAR(32)   NULL,
    overall_risk_flag   NVARCHAR(32)   NULL,
    model               NVARCHAR(128)  NULL,
    manufacturer        NVARCHAR(128)  NULL,
    serial_number       NVARCHAR(128)  NULL,
    owner_type          NVARCHAR(32)   NULL,  -- managedDeviceOwnerType: company | personal | unknown
    enrollment_type     NVARCHAR(64)   NULL,  -- deviceEnrollmentType (Graph)
    is_azure_ad_joined  BIT            NULL,  -- azureADRegistered (Graph)
    CONSTRAINT PK_intune_devices PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_intune_exec ON dbo.intune_devices (execution_id);
GO

-- ── intune_compliance_states ─────────────────────────────────────────────────
-- 1 linha por (dispositivo, politica de compliance) - de
-- /managedDevices/{id}/deviceCompliancePolicyStates. Mostra POR POLITICA se o
-- device esta compliant/nonCompliant, nao so o booleano geral de
-- intune_devices.compliance_status.
CREATE TABLE dbo.intune_compliance_states (
    id            BIGINT IDENTITY(1,1) NOT NULL,
    execution_id  NVARCHAR(64)   NOT NULL,
    device_id     NVARCHAR(64)   NULL,
    device_name   NVARCHAR(256)  NULL,
    policy_name   NVARCHAR(256)  NULL,
    platform_type NVARCHAR(64)   NULL,
    state         NVARCHAR(32)   NULL,  -- compliant | nonCompliant | error | conflict | notAssigned | ...
    setting_count INT            NULL,
    CONSTRAINT PK_intune_compliance_states PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_intune_compliance_exec ON dbo.intune_compliance_states (execution_id);
GO

-- ── meetings ─────────────────────────────────────────────────────────────────

CREATE TABLE dbo.meetings (
    id                BIGINT IDENTITY(1,1) NOT NULL,
    execution_id      NVARCHAR(64)   NOT NULL,
    user_email        NVARCHAR(256)  NULL,
    event_title       NVARCHAR(512)  NULL,
    start_time        DATETIME2      NULL,
    end_time          DATETIME2      NULL,
    duration_minutes  INT            NULL,
    categories        NVARCHAR(512)  NULL,
    meeting_type      NVARCHAR(32)   NULL,
    attendance_status NVARCHAR(64)   NULL,
    CONSTRAINT PK_meetings PRIMARY KEY (id)
);
CREATE NONCLUSTERED INDEX IX_meet_exec  ON dbo.meetings (execution_id);
CREATE NONCLUSTERED INDEX IX_meet_user  ON dbo.meetings (user_email);
GO

-- ============================================================================
-- 2. TABELAS DE PRE-AGREGACAO
--    Alimentadas por dbo.sp_RefreshDashboardAggregates (secao 4). Sem elas,
--    o dashboard cairia para varredura direta em files_info (250M+ linhas)
--    e estouraria timeout — foi exatamente o problema observado no dashboard.
-- ============================================================================

-- ── agg_files_by_site ────────────────────────────────────────────────────────
CREATE TABLE dbo.agg_files_by_site (
    execution_id               NVARCHAR(64)   NOT NULL,
    site_url                   NVARCHAR(512)  NOT NULL,
    site_name                  NVARCHAR(256)  NULL,
    total_files                BIGINT         NOT NULL DEFAULT 0,
    total_size_bytes           BIGINT         NOT NULL DEFAULT 0,
    total_size_with_ver_bytes  BIGINT         NOT NULL DEFAULT 0,
    stale_1y_count              BIGINT         NOT NULL DEFAULT 0,
    stale_1y_bytes              BIGINT         NOT NULL DEFAULT 0,
    stale_2y_count              BIGINT         NOT NULL DEFAULT 0,
    stale_2y_bytes              BIGINT         NOT NULL DEFAULT 0,
    stale_3y_count              BIGINT         NOT NULL DEFAULT 0,
    stale_3y_bytes              BIGINT         NOT NULL DEFAULT 0,
    stale_5y_count              BIGINT         NOT NULL DEFAULT 0,
    stale_5y_bytes              BIGINT         NOT NULL DEFAULT 0,
    version_overhead_bytes     BIGINT         NOT NULL DEFAULT 0,
    files_over_50_versions     BIGINT         NOT NULL DEFAULT 0,
    files_over_100_versions    BIGINT         NOT NULL DEFAULT 0,
    unclassified_count         BIGINT         NOT NULL DEFAULT 0,
    unclassified_bytes         BIGINT         NOT NULL DEFAULT 0,
    preservation_hold_count    BIGINT         NOT NULL DEFAULT 0,
    preservation_hold_bytes    BIGINT         NOT NULL DEFAULT 0,
    total_versions              BIGINT         NOT NULL DEFAULT 0,
    refreshed_at                DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_files_by_site PRIMARY KEY (execution_id, site_url)
);
GO

-- ── agg_duplicate_candidates ────────────────────────────────────────────────
CREATE TABLE dbo.agg_duplicate_candidates (
    execution_id        NVARCHAR(64)   NOT NULL,
    file_hash           NVARCHAR(128)  NOT NULL,
    copy_count          BIGINT         NOT NULL,
    sample_file_name    NVARCHAR(512)  NULL,
    file_type           NVARCHAR(32)   NULL,
    file_size_bytes     BIGINT         NULL,
    wasted_bytes        BIGINT         NOT NULL DEFAULT 0,
    distinct_sites      INT            NOT NULL DEFAULT 0,
    original_created    DATETIME2      NULL,
    last_touched        DATETIME2      NULL,
    refreshed_at        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_duplicates PRIMARY KEY (execution_id, file_hash)
);
GO

-- ── agg_files_by_owner ───────────────────────────────────────────────────────
CREATE TABLE dbo.agg_files_by_owner (
    execution_id               NVARCHAR(64)   NOT NULL,
    owner_mail                 NVARCHAR(256)  NOT NULL,
    owner_name                 NVARCHAR(256)  NULL,
    total_files                BIGINT         NOT NULL DEFAULT 0,
    total_size_bytes           BIGINT         NOT NULL DEFAULT 0,
    total_size_with_ver_bytes  BIGINT         NOT NULL DEFAULT 0,
    stale_2y_count              BIGINT         NOT NULL DEFAULT 0,
    stale_2y_bytes              BIGINT         NOT NULL DEFAULT 0,
    distinct_sites             INT            NOT NULL DEFAULT 0,
    version_overhead_bytes     BIGINT         NOT NULL DEFAULT 0,
    refreshed_at                DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_files_by_owner PRIMARY KEY (execution_id, owner_mail)
);
GO

-- ── agg_file_types (card "Tipos de Arquivo por Espaço") ─────────────────────
CREATE TABLE dbo.agg_file_types (
    execution_id     NVARCHAR(64)   NOT NULL,
    file_type        NVARCHAR(32)   NOT NULL,
    total_files      BIGINT         NOT NULL DEFAULT 0,
    total_size_bytes BIGINT         NOT NULL DEFAULT 0,
    refreshed_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_file_types PRIMARY KEY (execution_id, file_type)
);
GO

-- ── agg_stale_by_site_year (card "Liberação por Inatividade") ───────────────
CREATE TABLE dbo.agg_stale_by_site_year (
    execution_id            NVARCHAR(64)    NOT NULL,
    site_name               NVARCHAR(256)   NOT NULL,
    site_url                NVARCHAR(300)   NOT NULL,   -- 300 mantem PK abaixo de 900 bytes
    years_without_changes   INT             NOT NULL,
    file_count              BIGINT          NOT NULL DEFAULT 0,
    file_size_mb            DECIMAL(18,3)   NOT NULL DEFAULT 0,
    total_file_size_mb      DECIMAL(18,3)   NOT NULL DEFAULT 0,
    total_file_size_gb      DECIMAL(18,3)   NOT NULL DEFAULT 0,
    versions_count_sum      BIGINT          NOT NULL DEFAULT 0,
    refreshed_at            DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_stale_by_site_year PRIMARY KEY (execution_id, site_url, years_without_changes)
);
GO

-- ── agg_version_by_site (card "Liberação por Versões") ──────────────────────
-- site_type: 'SharePoint' | 'OneDrive' - usado por sp_dash_version_savings pra
-- segmentar a economia por N-versoes por aba (mesma convencao de site_type_norm
-- usada nas outras agregacoes por tecnologia).
CREATE TABLE dbo.agg_version_by_site (
    execution_id              NVARCHAR(64)    NOT NULL,
    site_type                  NVARCHAR(16)    NOT NULL DEFAULT 'SharePoint',
    site_name                 NVARCHAR(256)   NOT NULL,
    versions_count             INT             NOT NULL,
    file_count                 BIGINT          NOT NULL DEFAULT 0,
    sum_file_size_bytes       BIGINT          NOT NULL DEFAULT 0,
    sum_total_file_size_bytes BIGINT          NOT NULL DEFAULT 0,
    overhead_bytes             BIGINT          NOT NULL DEFAULT 0,
    refreshed_at                DATETIME2       NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_version_by_site PRIMARY KEY (execution_id, site_type, site_name, versions_count)
);
CREATE NONCLUSTERED INDEX IX_agg_ver_site_exec
ON dbo.agg_version_by_site (execution_id, site_type, site_name)
INCLUDE (versions_count, sum_file_size_bytes, sum_total_file_size_bytes, overhead_bytes);
GO

-- ── agg_file_types_by_sitetype (abas SharePoint/OneDrive — tipos de arquivo) ─
CREATE TABLE dbo.agg_file_types_by_sitetype (
    execution_id     NVARCHAR(64)   NOT NULL,
    site_type        NVARCHAR(16)   NOT NULL,   -- 'SharePoint' | 'OneDrive'
    file_type        NVARCHAR(32)   NOT NULL,
    total_files      BIGINT         NOT NULL DEFAULT 0,
    total_size_bytes BIGINT         NOT NULL DEFAULT 0,
    refreshed_at     DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_file_types_by_sitetype PRIMARY KEY (execution_id, site_type, file_type)
);
GO

-- ── agg_top_versioned_files (abas SharePoint/OneDrive — top docs por versao) ─
CREATE TABLE dbo.agg_top_versioned_files (
    execution_id      NVARCHAR(64)   NOT NULL,
    site_type         NVARCHAR(16)   NOT NULL,   -- 'SharePoint' | 'OneDrive'
    rn                INT            NOT NULL,   -- ranking dentro do site_type (1 = mais versoes)
    file_name         NVARCHAR(512)  NULL,
    file_url          NVARCHAR(MAX)  NULL,
    site_name         NVARCHAR(256)  NULL,
    versions_count    INT            NULL,
    file_size         BIGINT         NULL,
    total_file_size   BIGINT         NULL,
    refreshed_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_top_versioned_files PRIMARY KEY (execution_id, site_type, rn)
);
GO

-- ── agg_top_heaviest_files (abas SharePoint/OneDrive — top docs por tamanho) ─
CREATE TABLE dbo.agg_top_heaviest_files (
    execution_id      NVARCHAR(64)   NOT NULL,
    site_type         NVARCHAR(16)   NOT NULL,   -- 'SharePoint' | 'OneDrive'
    rn                INT            NOT NULL,   -- ranking dentro do site_type (1 = mais pesado, por total_file_size)
    file_name         NVARCHAR(512)  NULL,
    file_url          NVARCHAR(MAX)  NULL,
    site_name         NVARCHAR(256)  NULL,
    versions_count    INT            NULL,
    file_size         BIGINT         NULL,
    total_file_size   BIGINT         NULL,
    refreshed_at      DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_top_heaviest_files PRIMARY KEY (execution_id, site_type, rn)
);
GO

-- ── agg_growth_monthly (aba SharePoint — crescimento mes a mes) ─────────────
CREATE TABLE dbo.agg_growth_monthly (
    execution_id   NVARCHAR(64)   NOT NULL,
    site_type      NVARCHAR(16)   NOT NULL,   -- 'SharePoint' | 'OneDrive'
    [year]         INT            NOT NULL,
    [month]        INT            NOT NULL,
    files_created  BIGINT         NOT NULL DEFAULT 0,
    bytes_created  BIGINT         NOT NULL DEFAULT 0,
    refreshed_at   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_agg_growth_monthly PRIMARY KEY (execution_id, site_type, [year], [month])
);
GO

-- ============================================================================
-- 3. INDEXES DE PERFORMANCE EM files_info
--    NCCI habilita batch mode nas agregacoes do refresh — sem ele o refresh
--    de 250M linhas pode nao terminar em tempo aceitavel. Nem todo tier do
--    Azure SQL Database suporta columnstore (Basic/S0-S2/Serverless-Basic
--    nao suportam) — por isso a criacao e opcional: se o tier nao suportar,
--    o script apenas avisa e segue (o refresh so fica mais lento, nao quebra).
-- ============================================================================

-- CREATE COLUMNSTORE INDEX roda via SQL dinamico: o erro 40536 (tier sem
-- suporte a columnstore) e levantado em tempo de COMPILACAO da instrucao, e
-- por isso nao e capturavel por TRY/CATCH quando escrito estaticamente no
-- batch — via EXEC() a compilacao acontece num escopo a parte em runtime,
-- o que torna o erro capturavel normalmente.
BEGIN TRY
    EXEC(N'
        CREATE NONCLUSTERED COLUMNSTORE INDEX NCCI_files_info_analytics
        ON dbo.files_info (
            execution_id, site_url, site_name, file_type,
            file_size, total_file_size, versions_count,
            years_without_changes, owner_mail, owner_name,
            file_hash, preservation_hold_library,
            file_compliance_tag, file_sec_classification,
            created_date, last_modified_date, is_subsite
        );
    ');
    PRINT 'NCCI_files_info_analytics criado.';
END TRY
BEGIN CATCH
    PRINT 'AVISO: columnstore index nao suportado neste tier do banco — pulado (' + ERROR_MESSAGE() + ')';
END CATCH
GO

-- Fallback quando o tier nao suporta columnstore (erro 40536 acima): indice
-- row-store largo, cobrindo TODAS as colunas que sp_RefreshDashboardAggregates
-- le por execution_id (a materializacao #f) - sem isso, sem columnstore, essa
-- leitura inicial faz key lookup pra quase toda coluna, e em tabelas grandes
-- isso sozinho estoura o timeout de 3600s. Mais espaco em disco e um pouco
-- mais lento no INSERT durante a coleta, mas elimina os key lookups no refresh.
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.files_info') AND name = 'NCCI_files_info_analytics'
)
BEGIN
    PRINT 'Columnstore indisponivel neste tier - criando indice de cobertura alternativo (IX_files_exec_covering)...';
    CREATE NONCLUSTERED INDEX IX_files_exec_covering
    ON dbo.files_info (execution_id)
    INCLUDE (
        site_url, site_name, file_hash, file_type,
        file_size, total_file_size, versions_count, years_without_changes,
        file_compliance_tag, file_sec_classification, preservation_hold_library,
        owner_mail, owner_name, created_date, last_modified_date
    );
    PRINT 'IX_files_exec_covering criado.';
END
GO

CREATE NONCLUSTERED INDEX IX_files_exec_site
ON dbo.files_info (execution_id, site_url)
INCLUDE (file_size, total_file_size, versions_count,
         years_without_changes, file_compliance_tag, file_sec_classification);
GO

-- Predicado de index filtrado nao aceita NOT IN — apenas =, <>, IN, IS [NOT] NULL, AND.
CREATE NONCLUSTERED INDEX IX_files_exec_hash
ON dbo.files_info (execution_id, file_hash)
INCLUDE (file_size, file_name, site_url)
WHERE file_hash IS NOT NULL AND file_hash <> '' AND file_hash <> 'N/A';
GO

CREATE NONCLUSTERED INDEX IX_files_exec_owner
ON dbo.files_info (execution_id, owner_mail)
INCLUDE (file_size, total_file_size, versions_count,
         years_without_changes, site_url, file_type);
GO

-- ============================================================================
-- 4. STORED PROCEDURES
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- sp_RefreshDashboardAggregates
--   Popula (DELETE + INSERT, idempotente) todas as tabelas agg_* para uma
--   execucao. Sem @execution_id, usa a ultima execucao 'completed' em
--   execution_history (ou, na ausencia dela, a ultima execution_id presente
--   em files_info). Chamada automaticamente por src\main.ps1 ao final de
--   cada assessment bem-sucedido.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_RefreshDashboardAggregates
    @execution_id NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF @execution_id IS NULL
        SELECT TOP 1 @execution_id = execution_id
        FROM dbo.execution_history
        WHERE status = 'completed'
        ORDER BY start_time DESC;

    IF @execution_id IS NULL
        SELECT TOP 1 @execution_id = execution_id FROM dbo.files_info ORDER BY id DESC;

    IF @execution_id IS NULL
    BEGIN
        PRINT 'sp_RefreshDashboardAggregates: nenhuma execucao encontrada, nada a fazer.';
        RETURN;
    END

    -- Materializa TODAS as colunas usadas pelas agregacoes abaixo em UMA
    -- unica passada por files_info (com LEFT JOIN a sites_info so para
    -- resolver site_type - preserva todas as linhas, igual as agregacoes
    -- originais que nunca filtraram por site_type). 1 scan+lookup + N leituras
    -- baratas do temp table, em vez de 1 scan por agregacao.
    --
    -- file_name/file_url ficam FORA de propósito: file_url e NVARCHAR(MAX),
    -- que nao pode entrar no columnstore index (limitacao do SQL Server) -
    -- entao toda linha pagava um key lookup na tabela base so pra trazer
    -- essas 2 colunas, mesmo elas so sendo usadas por 3 dos 10 blocos abaixo
    -- (duplicados/top versionados/top pesados). Em tenants grandes isso
    -- sozinho estourava o timeout. f.id (chave clustered, sem custo extra)
    -- fica no lugar - os blocos que precisam do nome/url buscam via JOIN de
    -- volta em files_info só para as poucas linhas que realmente precisam
    -- (grupos de duplicados, top 50 por tecnologia), nao a tabela inteira.
    IF OBJECT_ID('tempdb..#f') IS NOT NULL DROP TABLE #f;
    SELECT
        f.id, f.site_url, f.site_name, f.file_hash, f.file_type,
        f.file_size, f.total_file_size, f.versions_count, f.years_without_changes,
        f.file_compliance_tag, f.file_sec_classification, f.preservation_hold_library,
        f.owner_mail, f.owner_name, f.created_date, f.last_modified_date,
        CASE WHEN s.site_type = 'OneDrive' THEN 'OneDrive' ELSE 'SharePoint' END AS site_type_norm,
        ISNULL(s.site_type,'Site') AS site_type_raw
    INTO #f
    FROM dbo.files_info f
    LEFT JOIN dbo.sites_info s
        ON s.execution_id = f.execution_id AND s.site_url = f.site_url
    WHERE f.execution_id = @execution_id;

    -- ── agg_files_by_site ────────────────────────────────────────────────────
    DELETE FROM dbo.agg_files_by_site WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_files_by_site
    SELECT
        @execution_id,
        f.site_url,
        MAX(f.site_name),
        COUNT_BIG(*),
        SUM(ISNULL(f.file_size, 0)),
        SUM(ISNULL(f.total_file_size, 0)),
        SUM(CASE WHEN f.years_without_changes >= 1  THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 1  THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 2  THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 2  THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 3  THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 3  THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 5  THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 5  THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(ISNULL(f.total_file_size,0) - ISNULL(f.file_size,0)),
        SUM(CASE WHEN f.versions_count >  50 THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.versions_count > 100 THEN 1 ELSE 0 END),
        SUM(CASE WHEN (f.file_compliance_tag IS NULL OR f.file_compliance_tag = '')
                  AND (f.file_sec_classification IS NULL OR f.file_sec_classification = '')
                 THEN 1 ELSE 0 END),
        SUM(CASE WHEN (f.file_compliance_tag IS NULL OR f.file_compliance_tag = '')
                  AND (f.file_sec_classification IS NULL OR f.file_sec_classification = '')
                 THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(CASE WHEN f.preservation_hold_library = 1 THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.preservation_hold_library = 1 THEN ISNULL(f.file_size,0) ELSE 0 END),
        SUM(ISNULL(f.versions_count, 0)),
        SYSUTCDATETIME()
    FROM #f f
    GROUP BY f.site_url;

    -- ── agg_duplicate_candidates ─────────────────────────────────────────────
    -- file_name so existe em files_info (fora de #f, ver comentario acima) -
    -- busca so pra 1 linha (MIN(id)) por grupo de duplicados, nao a tabela
    -- inteira.
    DELETE FROM dbo.agg_duplicate_candidates WHERE execution_id = @execution_id;
    ;WITH dup AS (
        SELECT
            f.file_hash,
            COUNT_BIG(*)                          AS copy_count,
            MAX(f.file_type)                      AS file_type,
            MAX(ISNULL(f.file_size, 0))            AS file_size,
            MIN(f.id)                              AS sample_id,
            COUNT(DISTINCT f.site_url)             AS distinct_sites,
            MIN(f.created_date)                    AS original_created,
            MAX(f.last_modified_date)              AS last_touched
        FROM #f f
        WHERE f.file_hash IS NOT NULL
          AND f.file_hash NOT IN ('', 'N/A')
        GROUP BY f.file_hash
        HAVING COUNT_BIG(*) > 1
    )
    INSERT INTO dbo.agg_duplicate_candidates
    SELECT
        @execution_id,
        d.file_hash,
        d.copy_count,
        ISNULL(ff.file_name, '(sem nome)'),
        d.file_type,
        d.file_size,
        (d.copy_count - 1) * d.file_size,
        d.distinct_sites,
        d.original_created,
        d.last_touched,
        SYSUTCDATETIME()
    FROM dup d
    LEFT JOIN dbo.files_info ff ON ff.id = d.sample_id;

    -- ── agg_files_by_owner ───────────────────────────────────────────────────
    DELETE FROM dbo.agg_files_by_owner WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_files_by_owner
    SELECT
        @execution_id,
        f.owner_mail,
        MAX(f.owner_name),
        COUNT_BIG(*),
        SUM(ISNULL(f.file_size, 0)),
        SUM(ISNULL(f.total_file_size, 0)),
        SUM(CASE WHEN f.years_without_changes >= 2 THEN 1 ELSE 0 END),
        SUM(CASE WHEN f.years_without_changes >= 2 THEN ISNULL(f.file_size,0) ELSE 0 END),
        COUNT(DISTINCT f.site_url),
        SUM(ISNULL(f.total_file_size,0) - ISNULL(f.file_size,0)),
        SYSUTCDATETIME()
    FROM #f f
    WHERE f.owner_mail IS NOT NULL
      AND f.owner_mail <> ''
    GROUP BY f.owner_mail;

    -- ── agg_file_types ────────────────────────────────────────────────────────
    DELETE FROM dbo.agg_file_types WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_file_types
    SELECT
        @execution_id,
        ISNULL(NULLIF(f.file_type, ''), 'sem extensao'),
        COUNT_BIG(*),
        SUM(ISNULL(f.file_size, 0)),
        SYSUTCDATETIME()
    FROM #f f
    GROUP BY ISNULL(NULLIF(f.file_type, ''), 'sem extensao');

    -- ── agg_stale_by_site_year ───────────────────────────────────────────────
    DELETE FROM dbo.agg_stale_by_site_year WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_stale_by_site_year
    SELECT
        @execution_id,
        ISNULL(f.site_name, '(sem nome)'),
        LEFT(ISNULL(f.site_url, ''), 300),
        CAST(FLOOR(ISNULL(f.years_without_changes, 0)) AS INT),
        COUNT_BIG(*),
        CAST(SUM(ISNULL(f.file_size, 0))       / 1048576.0    AS DECIMAL(18,3)),
        CAST(SUM(ISNULL(f.total_file_size, 0)) / 1048576.0    AS DECIMAL(18,3)),
        CAST(SUM(ISNULL(f.total_file_size, 0)) / 1073741824.0 AS DECIMAL(18,3)),
        SUM(ISNULL(f.versions_count, 0)),
        SYSUTCDATETIME()
    FROM #f f
    GROUP BY
        ISNULL(f.site_name, '(sem nome)'),
        LEFT(ISNULL(f.site_url, ''), 300),
        CAST(FLOOR(ISNULL(f.years_without_changes, 0)) AS INT);

    -- ── agg_version_by_site ──────────────────────────────────────────────────
    DELETE FROM dbo.agg_version_by_site WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_version_by_site
    SELECT
        @execution_id,
        f.site_type_norm,
        ISNULL(f.site_name, '(sem nome)'),
        ISNULL(f.versions_count, 1),
        COUNT_BIG(*),
        SUM(ISNULL(f.file_size, 0)),
        SUM(ISNULL(f.total_file_size, 0)),
        SUM(ISNULL(f.total_file_size, 0) - ISNULL(f.file_size, 0)),
        SYSUTCDATETIME()
    FROM #f f
    WHERE ISNULL(f.versions_count, 0) > 0
    GROUP BY
        f.site_type_norm,
        ISNULL(f.site_name, '(sem nome)'),
        ISNULL(f.versions_count, 1);

    -- ── agg_file_types_by_sitetype (abas SharePoint/OneDrive) ────────────────
    DELETE FROM dbo.agg_file_types_by_sitetype WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_file_types_by_sitetype
    SELECT
        @execution_id, f.site_type_norm,
        ISNULL(NULLIF(f.file_type, ''), 'sem extensao'),
        COUNT_BIG(*),
        SUM(ISNULL(f.file_size, 0)),
        SYSUTCDATETIME()
    FROM #f f
    WHERE f.site_type_raw <> 'Subsite'
    GROUP BY f.site_type_norm, ISNULL(NULLIF(f.file_type, ''), 'sem extensao');

    -- ── agg_top_versioned_files (abas SharePoint/OneDrive) ───────────────────
    -- Ranking usa so o que ja esta em #f (sem custo); file_name/file_url
    -- buscados em files_info so pras <=50 linhas vencedoras por tecnologia,
    -- nao a tabela inteira (ver comentario na montagem de #f acima).
    DELETE FROM dbo.agg_top_versioned_files WHERE execution_id = @execution_id;
    ;WITH ranked AS (
        SELECT
            id, site_type_norm AS site_type, site_name, versions_count, file_size, total_file_size,
            ROW_NUMBER() OVER (PARTITION BY site_type_norm ORDER BY ISNULL(versions_count,0) DESC) AS rn
        FROM #f
        WHERE site_type_raw <> 'Subsite'
          AND ISNULL(versions_count, 0) > 0
    )
    INSERT INTO dbo.agg_top_versioned_files
    SELECT
        @execution_id, r.site_type, r.rn, ff.file_name, ff.file_url, r.site_name,
        r.versions_count, r.file_size, r.total_file_size, SYSUTCDATETIME()
    FROM ranked r
    JOIN dbo.files_info ff ON ff.id = r.id
    WHERE r.rn <= 50;

    -- ── agg_top_heaviest_files (abas SharePoint/OneDrive) ────────────────────
    DELETE FROM dbo.agg_top_heaviest_files WHERE execution_id = @execution_id;
    ;WITH ranked_heavy AS (
        SELECT
            id, site_type_norm AS site_type, site_name, versions_count, file_size, total_file_size,
            ROW_NUMBER() OVER (PARTITION BY site_type_norm ORDER BY ISNULL(total_file_size,0) DESC) AS rn
        FROM #f
        WHERE site_type_raw <> 'Subsite'
    )
    INSERT INTO dbo.agg_top_heaviest_files
    SELECT
        @execution_id, r.site_type, r.rn, ff.file_name, ff.file_url, r.site_name,
        r.versions_count, r.file_size, r.total_file_size, SYSUTCDATETIME()
    FROM ranked_heavy r
    JOIN dbo.files_info ff ON ff.id = r.id
    WHERE r.rn <= 50;

    -- ── agg_growth_monthly (aba SharePoint) ──────────────────────────────────
    DELETE FROM dbo.agg_growth_monthly WHERE execution_id = @execution_id;
    INSERT INTO dbo.agg_growth_monthly
    SELECT
        @execution_id, f.site_type_norm,
        YEAR(f.created_date), MONTH(f.created_date),
        COUNT_BIG(*),
        SUM(ISNULL(f.total_file_size, 0)),
        SYSUTCDATETIME()
    FROM #f f
    WHERE f.site_type_raw <> 'Subsite'
      AND f.created_date IS NOT NULL
      AND YEAR(f.created_date) BETWEEN 2000 AND 2030
    GROUP BY f.site_type_norm, YEAR(f.created_date), MONTH(f.created_date);

    DROP TABLE #f;

    SELECT @execution_id AS execution_id, 'refreshed' AS status;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_resolve_execution_id
--   Resolve qual execution_id o dashboard deve exibir. Aceita uma "dica"
--   (ex: execution_id gravado em global_status.json) e so a usa se ela
--   realmente tiver dados em files_info; caso contrario cai para a ultima
--   execucao com arquivos, e por fim para a ultima execucao com sites.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_resolve_execution_id
    @execution_id_hint NVARCHAR(64) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @eid NVARCHAR(64) = NULL;

    IF @execution_id_hint IS NOT NULL
       AND EXISTS (SELECT 1 FROM dbo.files_info WHERE execution_id = @execution_id_hint)
        SET @eid = @execution_id_hint;

    IF @eid IS NULL
        SELECT TOP 1 @eid = execution_id FROM dbo.files_info ORDER BY id DESC;

    IF @eid IS NULL
        SELECT TOP 1 @eid = execution_id FROM dbo.sites_info ORDER BY id DESC;

    SELECT @eid AS execution_id;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_sites_summary — cards de sites do topo do dashboard
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_sites_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    -- Cota real do tenant (Get-PnPTenant, gravada 1x por execucao em
    -- execution_history). Se ainda nao existir (execucao coletada antes
    -- dessa melhoria, ou a chamada falhou), cai para o MAX() por site como
    -- estimativa - melhor que 0/branco, mas o valor correto e o de cima.
    DECLARE @tenantQuotaMb BIGINT;
    SELECT @tenantQuotaMb = tenant_storage_quota_mb FROM dbo.execution_history WHERE execution_id = @execution_id;

    SELECT
        COUNT(*)                                                                 AS total,
        SUM(CASE WHEN is_external_sharing_enabled = 1 THEN 1 ELSE 0 END)        AS external_sharing,
        SUM(CASE WHEN is_teams_connected = 1          THEN 1 ELSE 0 END)        AS teams_connected,
        SUM(CASE WHEN is_teams_channel_connected = 1  THEN 1 ELSE 0 END)        AS teams_channel,
        CAST(SUM(ISNULL(storage_used,0))  AS BIGINT)                            AS storage_mb,
        -- SharePoint: cota real do tenant (nao soma por site - ver comentario
        -- acima). OneDrive: cada conta tem cota propria e genuinamente somavel.
        CAST(
            ISNULL(@tenantQuotaMb, ISNULL(MAX(CASE WHEN ISNULL(site_type,'Site') <> 'OneDrive' THEN storage_quota END), 0))
          + ISNULL(SUM(CASE WHEN site_type = 'OneDrive' THEN ISNULL(storage_quota,0) ELSE 0 END), 0)
        AS BIGINT)                                                              AS quota_mb,
        SUM(ISNULL(subsites_count,0))                                           AS subsites,
        SUM(ISNULL(document_library_items_count,0))                             AS doc_items
    FROM dbo.sites_info
    WHERE execution_id = @execution_id;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_files_summary — card "Arquivos - Visão Geral"
--   Le de agg_files_by_site (instantaneo); so faz scan direto em files_info
--   se a agregacao ainda nao tiver sido gerada para essa execucao.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_files_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.agg_files_by_site WHERE execution_id = @execution_id)
    BEGIN
        SELECT
            SUM(total_files)                            AS total,
            CAST(SUM(total_size_bytes) AS BIGINT)        AS size_bytes,
            CAST(SUM(total_size_with_ver_bytes) AS BIGINT) AS versioned_bytes,
            SUM(stale_1y_count)                          AS stale_1y,
            SUM(stale_2y_count)                          AS stale_2y,
            SUM(stale_3y_count)                          AS stale_3y,
            SUM(stale_5y_count)                          AS stale_5y,
            CAST(SUM(stale_1y_bytes) AS BIGINT)          AS stale_1y_bytes,
            CAST(SUM(stale_2y_bytes) AS BIGINT)          AS stale_2y_bytes,
            CAST(SUM(stale_3y_bytes) AS BIGINT)          AS stale_3y_bytes,
            CAST(SUM(stale_5y_bytes) AS BIGINT)          AS stale_5y_bytes,
            SUM(preservation_hold_count)                 AS preserved,
            ISNULL(SUM(total_versions),0)                AS total_versions
        FROM dbo.agg_files_by_site
        WHERE execution_id = @execution_id;
    END
    ELSE
    BEGIN
        SELECT
            COUNT(*)                                                                        AS total,
            CAST(SUM(ISNULL(file_size,0)) AS BIGINT)                                        AS size_bytes,
            CAST(SUM(ISNULL(total_file_size,0)) AS BIGINT)                                  AS versioned_bytes,
            SUM(CASE WHEN years_without_changes>=1 THEN 1 ELSE 0 END)                        AS stale_1y,
            SUM(CASE WHEN years_without_changes>=2 THEN 1 ELSE 0 END)                        AS stale_2y,
            SUM(CASE WHEN years_without_changes>=3 THEN 1 ELSE 0 END)                        AS stale_3y,
            SUM(CASE WHEN years_without_changes>=5 THEN 1 ELSE 0 END)                        AS stale_5y,
            CAST(SUM(CASE WHEN years_without_changes>=1 THEN ISNULL(file_size,0) ELSE 0 END) AS BIGINT) AS stale_1y_bytes,
            CAST(SUM(CASE WHEN years_without_changes>=2 THEN ISNULL(file_size,0) ELSE 0 END) AS BIGINT) AS stale_2y_bytes,
            CAST(SUM(CASE WHEN years_without_changes>=3 THEN ISNULL(file_size,0) ELSE 0 END) AS BIGINT) AS stale_3y_bytes,
            CAST(SUM(CASE WHEN years_without_changes>=5 THEN ISNULL(file_size,0) ELSE 0 END) AS BIGINT) AS stale_5y_bytes,
            SUM(CASE WHEN preservation_hold_library=1 THEN 1 ELSE 0 END)                     AS preserved,
            ISNULL(SUM(versions_count),0)                                                    AS total_versions
        FROM dbo.files_info
        WHERE execution_id = @execution_id;
    END
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_file_types — card "Tipos de Arquivo por Espaço"
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_file_types
    @execution_id NVARCHAR(64),
    @top_n        INT = 30
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.agg_file_types WHERE execution_id = @execution_id)
    BEGIN
        SELECT TOP (@top_n) file_type, total_files AS cnt, total_size_bytes AS size_bytes
        FROM dbo.agg_file_types
        WHERE execution_id = @execution_id
        ORDER BY total_size_bytes DESC;
    END
    ELSE
    BEGIN
        SELECT TOP (@top_n)
            ISNULL(file_type,'sem extensao')             AS file_type,
            COUNT(*)                                      AS cnt,
            CAST(SUM(ISNULL(file_size,0)) AS BIGINT)     AS size_bytes
        FROM dbo.files_info
        WHERE execution_id = @execution_id
        GROUP BY ISNULL(file_type,'sem extensao')
        ORDER BY size_bytes DESC;
    END
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_critical_sites — sites sensiveis com acesso externo
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_critical_sites
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP 20
        ISNULL(site_title, site_url)                                    AS site_title,
        site_url,
        ISNULL(sharing_capability, '')                                  AS sharing_capability,
        CAST(ISNULL(storage_used,0) * 1048576 AS BIGINT)                AS storage_bytes
    FROM dbo.sites_info
    WHERE execution_id = @execution_id
      AND is_external_sharing_enabled = 1
      AND (
            LOWER(ISNULL(site_title,'')) LIKE '%rh%'        OR LOWER(ISNULL(site_url,'')) LIKE '%rh%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%hr%'        OR LOWER(ISNULL(site_url,'')) LIKE '%hr%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%contrat%'   OR LOWER(ISNULL(site_url,'')) LIKE '%contrat%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%juridic%'   OR LOWER(ISNULL(site_url,'')) LIKE '%juridic%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%financ%'    OR LOWER(ISNULL(site_url,'')) LIKE '%financ%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%folha%'     OR LOWER(ISNULL(site_url,'')) LIKE '%folha%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%payroll%'   OR LOWER(ISNULL(site_url,'')) LIKE '%payroll%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%legal%'     OR LOWER(ISNULL(site_url,'')) LIKE '%legal%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%compliance%'OR LOWER(ISNULL(site_url,'')) LIKE '%compliance%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%fiscal%'    OR LOWER(ISNULL(site_url,'')) LIKE '%fiscal%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%salary%'    OR LOWER(ISNULL(site_url,'')) LIKE '%salary%'
         OR LOWER(ISNULL(site_title,'')) LIKE '%dp %'       OR LOWER(ISNULL(site_url,'')) LIKE '%dp %'
      )
    ORDER BY storage_bytes DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_all_sites — listagem completa de sites (nao so os sensiveis),
-- ordenavel por tamanho ou quantidade de arquivos, segmentada por site_type
-- ('OneDrive' vs demais) para o frontend renderizar em tabelas separadas.
-- Subsites ficam de fora (sao paginas filhas, nao site collections).
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_all_sites
    @execution_id NVARCHAR(64),
    @top_n        INT = 500
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        ISNULL(s.site_title, s.site_url)                                 AS title,
        s.site_url                                                       AS url,
        ISNULL(s.site_type, 'Site')                                      AS site_type,
        ISNULL(s.is_external_sharing_enabled, 0)                         AS external_sharing,
        ISNULL(s.sharing_capability, '')                                 AS sharing_capability,
        ISNULL(a.total_files, 0)                                         AS total_files,
        -- Mesma fonte de tamanho usada em sp_dash_orphaned_sites/sp_dash_critical_sites
        -- (storage_used, reportado pelo proprio SPO) - antes usava total_size_with_ver_bytes
        -- (soma via crawl de files_info), que da um numero menor por nao contar lixeira
        -- e afins, causando divergencia entre as tabelas do dashboard.
        CAST(ISNULL(s.storage_used,0) * 1048576.0 AS BIGINT)             AS size_bytes
    FROM dbo.sites_info s
    LEFT JOIN dbo.agg_files_by_site a
        ON a.execution_id = s.execution_id AND a.site_url = s.site_url
    WHERE s.execution_id = @execution_id
      AND ISNULL(s.site_type, 'Site') <> 'Subsite'
    ORDER BY size_bytes DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_trash_summary — card "Lixeira" (resumo)
--   item_state gravado pelo PnP.PowerShell vem como 'FirstStageRecycleBin' /
--   'SecondStageRecycleBin' (comparacao abaixo e case-insensitive por padrao
--   na collation do SQL Server).
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_trash_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                             AS total_items,
        SUM(CASE WHEN item_type = 'File' THEN 1 ELSE 0 END)                                 AS file_count,
        CAST(SUM(ISNULL(size_bytes,0)) AS BIGINT)                                            AS size_bytes,
        SUM(CASE WHEN item_state = 'firstStageRecycleBin'  THEN 1 ELSE 0 END)               AS first_stage,
        SUM(CASE WHEN item_state = 'secondStageRecycleBin' THEN 1 ELSE 0 END)               AS second_stage,
        CAST(SUM(CASE WHEN item_state = 'firstStageRecycleBin'
                       THEN ISNULL(size_bytes,0) ELSE 0 END) AS BIGINT)                      AS first_stage_bytes,
        CAST(SUM(CASE WHEN item_state = 'secondStageRecycleBin'
                       THEN ISNULL(size_bytes,0) ELSE 0 END) AS BIGINT)                      AS second_stage_bytes
    FROM dbo.trash_items
    WHERE execution_id = @execution_id;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_executions_list — combo de execucoes disponiveis no dashboard
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_executions_list
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH site_counts AS (
        SELECT execution_id, COUNT(*) AS sites FROM dbo.sites_info GROUP BY execution_id
    ),
    file_counts AS (
        -- Le de agg_files_by_site (centenas de linhas, ja pre-agregado por
        -- sp_RefreshDashboardAggregates) em vez de COUNT(*) direto em
        -- files_info (centenas de milhoes de linhas sem filtro de
        -- execution_id) - isso rodava a cada carregamento do dashboard e
        -- travava por minutos. Execucoes ainda nao re-agregadas aparecem com
        -- 0 arquivos ate o proximo refresh, mesma limitacao ja aceita em
        -- outras procs *_by_type que dependem de agg_files_by_site.
        SELECT execution_id, SUM(total_files) AS files FROM dbo.agg_files_by_site GROUP BY execution_id
    ),
    ts AS (
        SELECT execution_id, MAX(start_time) AS start_time FROM dbo.execution_history GROUP BY execution_id
    ),
    all_ids AS (
        SELECT execution_id FROM site_counts
        UNION
        SELECT execution_id FROM file_counts
        UNION
        SELECT execution_id FROM ts
    )
    SELECT TOP 20
        a.execution_id,
        ISNULL(LEFT(CONVERT(VARCHAR(19), ts.start_time, 120), 16), '')  AS start_time,
        CAST(ISNULL(sc.sites, 0) AS BIGINT)                             AS sites,
        CAST(ISNULL(fc.files, 0) AS BIGINT)                             AS files,
        'completed'                                                     AS status
    FROM all_ids a
    LEFT JOIN site_counts sc ON sc.execution_id = a.execution_id
    LEFT JOIN file_counts fc ON fc.execution_id = a.execution_id
    LEFT JOIN ts            ON ts.execution_id  = a.execution_id
    ORDER BY (ISNULL(sc.sites,0) + ISNULL(fc.files,0)) DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_lixeira_top_sites — Página 1 (Lixeira): top N sites por GB na lixeira
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_lixeira_top_sites
    @execution_id NVARCHAR(64),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        site_path,
        CAST(SUM(total_gb) AS FLOAT) AS total_gb
    FROM (
        SELECT
            CASE
                WHEN original_location LIKE '/sites/%'
                THEN 'sites/' + LEFT(
                        SUBSTRING(original_location, 8, LEN(original_location)),
                        CHARINDEX('/', SUBSTRING(original_location, 8, LEN(original_location)) + '/') - 1
                     )
                ELSE ISNULL(site_title, '(sem site)')
            END                                                       AS site_path,
            ISNULL(size_bytes,0) / 1073741824.0                       AS total_gb
        FROM dbo.trash_items
        WHERE execution_id = @execution_id
    ) t
    GROUP BY site_path
    ORDER BY total_gb DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_sites_totais — Página 2 (Visão Geral): cards de contagem de sites
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_sites_totais
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                  AS qtde_sites_total,
        SUM(CASE WHEN is_external_sharing_enabled = 1 THEN 1 ELSE 0 END)         AS qtde_sites_compart_externo,
        SUM(CASE WHEN is_teams_connected = 1          THEN 1 ELSE 0 END)         AS qtde_sites_teams,
        SUM(CASE WHEN DATEDIFF(DAY, last_modified_date, SYSUTCDATETIME()) > 365
                 THEN 1 ELSE 0 END)                                               AS qtde_sites_inativos_1a,
        CAST(SUM(ISNULL(storage_used,0)) / 1099511627776.0 AS FLOAT)             AS storage_total_tb
    FROM dbo.sites_info
    WHERE execution_id = @execution_id;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_sites_por_subsite — Página 2: pizza "Sites x Subsites"
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_sites_por_subsite
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        CAST(ISNULL(is_subsite,0) AS BIT) AS is_subsite,
        COUNT(*)                          AS file_count
    FROM dbo.files_info
    WHERE execution_id = @execution_id
    GROUP BY CAST(ISNULL(is_subsite,0) AS BIT);
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_sites_top — Página 2: bar chart "Top N Sites" por GB
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_sites_top
    @execution_id NVARCHAR(64),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        CASE WHEN site_url LIKE '%/sites/%'
             THEN 'sites/' + SUBSTRING(site_url, CHARINDEX('/sites/', site_url)+7, 120)
             WHEN site_url LIKE '%/teams/%'
             THEN 'teams/' + SUBSTRING(site_url, CHARINDEX('/teams/', site_url)+7, 120)
             ELSE site_url END                                          AS relative_url,
        CAST(SUM(total_size_with_ver_bytes) / 1073741824.0 AS FLOAT)   AS total_gb
    FROM dbo.agg_files_by_site
    WHERE execution_id = @execution_id
    GROUP BY site_url,
        CASE WHEN site_url LIKE '%/sites/%'
             THEN 'sites/' + SUBSTRING(site_url, CHARINDEX('/sites/', site_url)+7, 120)
             WHEN site_url LIKE '%/teams/%'
             THEN 'teams/' + SUBSTRING(site_url, CHARINDEX('/teams/', site_url)+7, 120)
             ELSE site_url END
    ORDER BY total_gb DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_sites_top_ext — Página 2: bar chart "Top N Extensões" por GB
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_sites_top_ext
    @execution_id NVARCHAR(64),
    @top_n        INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.agg_file_types WHERE execution_id = @execution_id)
    BEGIN
        SELECT TOP (@top_n)
            LOWER(ISNULL(NULLIF(file_type,''), 'unknown'))               AS extensao,
            CAST(SUM(total_size_bytes) / 1073741824.0 AS FLOAT)         AS total_gb
        FROM dbo.agg_file_types
        WHERE execution_id = @execution_id
        GROUP BY LOWER(ISNULL(NULLIF(file_type,''), 'unknown'))
        ORDER BY total_gb DESC;
    END
    ELSE
    BEGIN
        SELECT TOP (@top_n)
            LOWER(ISNULL(NULLIF(file_type,''), 'unknown'))                     AS extensao,
            CAST(SUM(ISNULL(total_file_size,0)) / 1073741824.0 AS FLOAT)      AS total_gb
        FROM dbo.files_info
        WHERE execution_id = @execution_id
        GROUP BY LOWER(ISNULL(NULLIF(file_type,''), 'unknown'))
        ORDER BY total_gb DESC;
    END
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_liberacao_summary — Página 3: cards de GB previsto por inatividade
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_liberacao_summary
    @execution_id NVARCHAR(64),
    @years_min    INT = 0,
    @years_max    INT = 99
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        CAST(ISNULL(SUM(file_count),0)              AS BIGINT) AS file_count,
        CAST(ISNULL(SUM(file_size_mb),0)  / 1024.0   AS FLOAT)  AS file_size_gb,
        CAST(ISNULL(SUM(total_file_size_gb),0)       AS FLOAT)  AS total_file_size_gb
    FROM dbo.agg_stale_by_site_year
    WHERE execution_id = @execution_id
      AND years_without_changes >= @years_min
      AND years_without_changes <= @years_max;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_liberacao_by_site — Página 3: matrix por site
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_liberacao_by_site
    @execution_id NVARCHAR(64),
    @years_min    INT = 0,
    @years_max    INT = 99
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        site_name,
        CAST(SUM(file_count)         AS BIGINT) AS file_count,
        CAST(SUM(file_size_mb)       AS FLOAT)  AS file_size_mb,
        CAST(SUM(total_file_size_mb) AS FLOAT)  AS total_file_size_mb,
        CAST(SUM(total_file_size_gb) AS FLOAT)  AS total_file_size_gb,
        CAST(SUM(versions_count_sum) AS BIGINT) AS versions_count_sum,
        CAST(MAX(years_without_changes) AS FLOAT) AS max_years
    FROM dbo.agg_stale_by_site_year
    WHERE execution_id = @execution_id
      AND years_without_changes >= @years_min
      AND years_without_changes <= @years_max
    GROUP BY site_name
    ORDER BY total_file_size_gb DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_versoes_by_site — Página 4: liberação por versões (What-If)
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_versoes_by_site
    @execution_id NVARCHAR(64),
    @ver_cap      INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        site_name,
        CAST(SUM(CAST(file_count AS BIGINT) * versions_count) AS BIGINT) AS qtde_versoes,
        CAST(SUM(sum_total_file_size_bytes) / 1073741824.0 AS FLOAT)     AS total_file_size_gb,
        CAST(SUM(
            CASE WHEN versions_count > @ver_cap AND versions_count > 0
                 THEN overhead_bytes * (1.0 - CAST(@ver_cap AS FLOAT) / versions_count)
                 ELSE 0.0 END
        ) / 1073741824.0 AS FLOAT)                                        AS espaco_liberado_gb
    FROM dbo.agg_version_by_site
    WHERE execution_id = @execution_id
    GROUP BY site_name
    ORDER BY espaco_liberado_gb DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- sp_dash_crescimento — Página 5: crescimento orgânico anual
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_crescimento
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    WITH annual AS (
        SELECT
            YEAR(created_date)                              AS ano,
            SUM(ISNULL(total_file_size, 0))                 AS total_file_size_bytes_anual,
            COUNT_BIG(*)                                     AS qtde_arquivos_criados
        FROM dbo.files_info
        WHERE execution_id = @execution_id
          AND created_date IS NOT NULL
          AND YEAR(created_date) BETWEEN 2000 AND 2030
        GROUP BY YEAR(created_date)
    )
    SELECT
        ano,
        qtde_arquivos_criados,
        CAST(total_file_size_bytes_anual / 1073741824.0 AS FLOAT) AS anual_gb,
        CAST(
            SUM(total_file_size_bytes_anual) OVER (ORDER BY ano ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            / 1073741824.0
        AS FLOAT)                                                 AS acumulado_gb
    FROM annual
    ORDER BY ano;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures das abas SharePoint / OneDrive do dashboard.
-- Convenção de tipo (igual a sp_dash_all_sites):
--   OneDrive   => site_type = 'OneDrive'
--   SharePoint => ISNULL(site_type,'Site') NOT IN ('OneDrive','Subsite')
-- ────────────────────────────────────────────────────────────────────────────

-- sp_dash_sites_summary_by_type — igual a sp_dash_sites_summary, filtrado por
-- tipo (sites_info e pequena, sem necessidade de tabela agregada)
CREATE PROCEDURE dbo.sp_dash_sites_summary_by_type
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    -- Cota real do tenant (Get-PnPTenant, gravada 1x por execucao em
    -- execution_history). Se ainda nao existir, cai para o MAX() por site
    -- como estimativa - melhor que 0/branco, mas o valor correto e o de cima.
    DECLARE @tenantQuotaMb BIGINT;
    SELECT @tenantQuotaMb = tenant_storage_quota_mb FROM dbo.execution_history WHERE execution_id = @execution_id;

    SELECT
        COUNT(*)                                                                 AS total,
        SUM(CASE WHEN is_external_sharing_enabled = 1 THEN 1 ELSE 0 END)        AS external_sharing,
        SUM(CASE WHEN is_teams_connected = 1          THEN 1 ELSE 0 END)        AS teams_connected,
        SUM(CASE WHEN is_teams_channel_connected = 1  THEN 1 ELSE 0 END)        AS teams_channel,
        CAST(SUM(ISNULL(storage_used,0))  AS BIGINT)                            AS storage_mb,
        -- SharePoint: cota real do tenant (nao soma por site - ver comentario
        -- acima). OneDrive: cada conta tem cota propria e genuinamente somavel.
        CAST(
            CASE WHEN @site_type = 'OneDrive'
                 THEN SUM(ISNULL(storage_quota,0))
                 ELSE ISNULL(@tenantQuotaMb, MAX(ISNULL(storage_quota,0)))
            END
        AS BIGINT)                                                              AS quota_mb,
        SUM(ISNULL(subsites_count,0))                                           AS subsites,
        SUM(ISNULL(document_library_items_count,0))                             AS doc_items
    FROM dbo.sites_info
    WHERE execution_id = @execution_id
      AND ISNULL(site_type,'Site') <> 'Subsite'
      AND (
            (@site_type = 'OneDrive' AND site_type = 'OneDrive')
         OR (@site_type <> 'OneDrive' AND ISNULL(site_type,'Site') <> 'OneDrive')
          );
END
GO

-- sp_dash_files_summary_by_type — igual a sp_dash_files_summary, mas junta
-- agg_files_by_site (por site) com sites_info (pequena) para filtrar por tipo,
-- sem tocar em files_info no caminho quente. Fallback direto se a agregacao
-- ainda nao existir para essa execucao.
CREATE PROCEDURE dbo.sp_dash_files_summary_by_type
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM dbo.agg_files_by_site WHERE execution_id = @execution_id)
    BEGIN
        SELECT
            SUM(a.total_files)                              AS total,
            CAST(SUM(a.total_size_bytes) AS BIGINT)          AS size_bytes,
            CAST(SUM(a.total_size_with_ver_bytes) AS BIGINT) AS versioned_bytes,
            SUM(a.stale_1y_count)                            AS stale_1y,
            SUM(a.stale_2y_count)                            AS stale_2y,
            SUM(a.stale_3y_count)                            AS stale_3y,
            SUM(a.stale_5y_count)                            AS stale_5y,
            CAST(SUM(a.stale_1y_bytes) AS BIGINT)            AS stale_1y_bytes,
            CAST(SUM(a.stale_2y_bytes) AS BIGINT)            AS stale_2y_bytes,
            CAST(SUM(a.stale_3y_bytes) AS BIGINT)            AS stale_3y_bytes,
            CAST(SUM(a.stale_5y_bytes) AS BIGINT)            AS stale_5y_bytes,
            SUM(a.preservation_hold_count)                   AS preserved,
            ISNULL(SUM(a.total_versions),0)                  AS total_versions
        FROM dbo.agg_files_by_site a
        JOIN dbo.sites_info s
            ON s.execution_id = a.execution_id AND s.site_url = a.site_url
        WHERE a.execution_id = @execution_id
          AND ISNULL(s.site_type,'Site') <> 'Subsite'
          AND (
                (@site_type = 'OneDrive' AND s.site_type = 'OneDrive')
             OR (@site_type <> 'OneDrive' AND ISNULL(s.site_type,'Site') <> 'OneDrive')
              );
    END
    ELSE
    BEGIN
        SELECT
            COUNT(*)                                                                        AS total,
            CAST(SUM(ISNULL(f.file_size,0)) AS BIGINT)                                        AS size_bytes,
            CAST(SUM(ISNULL(f.total_file_size,0)) AS BIGINT)                                  AS versioned_bytes,
            SUM(CASE WHEN f.years_without_changes>=1 THEN 1 ELSE 0 END)                        AS stale_1y,
            SUM(CASE WHEN f.years_without_changes>=2 THEN 1 ELSE 0 END)                        AS stale_2y,
            SUM(CASE WHEN f.years_without_changes>=3 THEN 1 ELSE 0 END)                        AS stale_3y,
            SUM(CASE WHEN f.years_without_changes>=5 THEN 1 ELSE 0 END)                        AS stale_5y,
            CAST(SUM(CASE WHEN f.years_without_changes>=1 THEN ISNULL(f.file_size,0) ELSE 0 END) AS BIGINT) AS stale_1y_bytes,
            CAST(SUM(CASE WHEN f.years_without_changes>=2 THEN ISNULL(f.file_size,0) ELSE 0 END) AS BIGINT) AS stale_2y_bytes,
            CAST(SUM(CASE WHEN f.years_without_changes>=3 THEN ISNULL(f.file_size,0) ELSE 0 END) AS BIGINT) AS stale_3y_bytes,
            CAST(SUM(CASE WHEN f.years_without_changes>=5 THEN ISNULL(f.file_size,0) ELSE 0 END) AS BIGINT) AS stale_5y_bytes,
            SUM(CASE WHEN f.preservation_hold_library=1 THEN 1 ELSE 0 END)                     AS preserved,
            ISNULL(SUM(f.versions_count),0)                                                    AS total_versions
        FROM dbo.files_info f
        JOIN dbo.sites_info s
            ON s.execution_id = f.execution_id AND s.site_url = f.site_url
        WHERE f.execution_id = @execution_id
          AND ISNULL(s.site_type,'Site') <> 'Subsite'
          AND (
                (@site_type = 'OneDrive' AND s.site_type = 'OneDrive')
             OR (@site_type <> 'OneDrive' AND ISNULL(s.site_type,'Site') <> 'OneDrive')
              );
    END
END
GO

-- sp_dash_trash_summary_by_type — igual a sp_dash_trash_summary, filtrado por
-- tipo via join com sites_info por site_id.
CREATE PROCEDURE dbo.sp_dash_trash_summary_by_type
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                             AS total_items,
        SUM(CASE WHEN t.item_type = 'File' THEN 1 ELSE 0 END)                                 AS file_count,
        CAST(SUM(ISNULL(t.size_bytes,0)) AS BIGINT)                                            AS size_bytes,
        SUM(CASE WHEN t.item_state = 'firstStageRecycleBin'  THEN 1 ELSE 0 END)               AS first_stage,
        SUM(CASE WHEN t.item_state = 'secondStageRecycleBin' THEN 1 ELSE 0 END)               AS second_stage,
        CAST(SUM(CASE WHEN t.item_state = 'firstStageRecycleBin'
                       THEN ISNULL(t.size_bytes,0) ELSE 0 END) AS BIGINT)                      AS first_stage_bytes,
        CAST(SUM(CASE WHEN t.item_state = 'secondStageRecycleBin'
                       THEN ISNULL(t.size_bytes,0) ELSE 0 END) AS BIGINT)                      AS second_stage_bytes
    FROM dbo.trash_items t
    JOIN dbo.sites_info s
        ON s.execution_id = t.execution_id AND s.site_url = t.site_url
    WHERE t.execution_id = @execution_id
      AND ISNULL(s.site_type,'Site') <> 'Subsite'
      AND (
            (@site_type = 'OneDrive' AND s.site_type = 'OneDrive')
         OR (@site_type <> 'OneDrive' AND ISNULL(s.site_type,'Site') <> 'OneDrive')
          );
END
GO

-- sp_dash_file_types_by_type — le agg_file_types_by_sitetype. SEM fallback de
-- scan direto em files_info: e uma agregacao nova (nao ha execucao "antiga"
-- para dar suporte), entao se a tabela agregada ainda nao foi populada para
-- essa execucao/tipo, a consulta so retorna vazio (instantaneo) em vez de
-- arriscar um scan+join caro nos 250M+ registros de files_info. Basta rodar
-- sp_RefreshDashboardAggregates para essa execucao para popular.
CREATE PROCEDURE dbo.sp_dash_file_types_by_type
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16),
    @top_n        INT = 30
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n) file_type, total_files AS cnt, total_size_bytes AS size_bytes
    FROM dbo.agg_file_types_by_sitetype
    WHERE execution_id = @execution_id AND site_type = @site_type
    ORDER BY total_size_bytes DESC;
END
GO

-- sp_dash_top_versioned_files — le agg_top_versioned_files. Sem fallback (ver
-- comentario acima) - o fallback antigo fazia ORDER BY versions_count sem
-- indice de suporte sobre files_info inteiro, caro demais para valer o risco.
CREATE PROCEDURE dbo.sp_dash_top_versioned_files
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n) file_name, file_url, site_name, versions_count, file_size, total_file_size
    FROM dbo.agg_top_versioned_files
    WHERE execution_id = @execution_id AND site_type = @site_type
    ORDER BY rn ASC;
END
GO

-- sp_dash_top_heaviest_files — igual a sp_dash_top_versioned_files, mas
-- ordenado por tamanho total (total_file_size) em vez de contagem de versoes.
CREATE PROCEDURE dbo.sp_dash_top_heaviest_files
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n) file_name, file_url, site_name, versions_count, file_size, total_file_size
    FROM dbo.agg_top_heaviest_files
    WHERE execution_id = @execution_id AND site_type = @site_type
    ORDER BY rn ASC;
END
GO

-- sp_dash_version_savings — quanto espaço um limite de N versões libera
-- (card "Histórico de Versões", botões 20/50/100). Mesma matemática de
-- sp_dash_versoes_by_site (proporcional: overhead_bytes assume todas as
-- versões do arquivo com tamanho parecido, então cortar em N libera
-- overhead_bytes * (1 - N/versions_count) para arquivos com mais de N
-- versões), só que agregada em 1 linha por site_type em vez de por site.
CREATE PROCEDURE dbo.sp_dash_version_savings
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        CAST(SUM(overhead_bytes) AS BIGINT) AS overhead_total_bytes,
        CAST(SUM(CASE WHEN versions_count > 20  THEN overhead_bytes * (1.0 - 20.0  / versions_count) ELSE 0 END) AS BIGINT) AS liberado_20v_bytes,
        CAST(SUM(CASE WHEN versions_count > 50  THEN overhead_bytes * (1.0 - 50.0  / versions_count) ELSE 0 END) AS BIGINT) AS liberado_50v_bytes,
        CAST(SUM(CASE WHEN versions_count > 100 THEN overhead_bytes * (1.0 - 100.0 / versions_count) ELSE 0 END) AS BIGINT) AS liberado_100v_bytes
    FROM dbo.agg_version_by_site
    WHERE execution_id = @execution_id
      AND site_type = @site_type;
END
GO

-- sp_dash_growth_monthly — le agg_growth_monthly, calcula acumulado. Sem
-- fallback (ver comentario acima) - o fallback antigo agrupava por
-- YEAR/MONTH(created_date) sem indice de suporte sobre files_info inteiro.
CREATE PROCEDURE dbo.sp_dash_growth_monthly
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16)
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH monthly AS (
        SELECT [year], [month], files_created, bytes_created
        FROM dbo.agg_growth_monthly
        WHERE execution_id = @execution_id AND site_type = @site_type
    )
    SELECT
        [year], [month], files_created,
        CAST(bytes_created / 1073741824.0 AS FLOAT) AS bytes_created_gb,
        CAST(
            SUM(bytes_created) OVER (ORDER BY [year], [month] ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
            / 1073741824.0
        AS FLOAT)                                    AS acumulado_gb
    FROM monthly
    ORDER BY [year], [month];
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures de governança: arquivos duplicados + sites sem dono ativo
-- ────────────────────────────────────────────────────────────────────────────

-- sp_dash_duplicate_candidates — Top N grupos de arquivos duplicados (por
-- hash de conteudo) com mais espaco desperdicado. Dado ja calculado em
-- agg_duplicate_candidates a cada refresh.
CREATE PROCEDURE dbo.sp_dash_duplicate_candidates
    @execution_id NVARCHAR(64),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        sample_file_name, file_type, copy_count, distinct_sites,
        CAST(wasted_bytes AS BIGINT) AS wasted_bytes
    FROM dbo.agg_duplicate_candidates
    WHERE execution_id = @execution_id
    ORDER BY wasted_bytes DESC;
END
GO

-- sp_dash_orphaned_sites — sites cujo(s) administrador(es) estao todos
-- desabilitados/inexistentes no Entra ID (ou sem nenhum administrador
-- coletado). Junta sites_info.administrators (STRING_SPLIT) com
-- site_owner_status.
CREATE PROCEDURE dbo.sp_dash_orphaned_sites
    @execution_id NVARCHAR(64),
    @site_type    NVARCHAR(16),
    @top_n        INT = 50
AS
BEGIN
    SET NOCOUNT ON;

    ;WITH site_owner_flags AS (
        SELECT
            s.site_url, s.site_title, s.storage_used,
            COUNT(DISTINCT sa.owner_mail) AS total_owners,
            SUM(CASE WHEN os.account_exists = 1 AND os.account_enabled = 1 THEN 1 ELSE 0 END) AS active_owners
        FROM dbo.sites_info s
        OUTER APPLY (
            SELECT LTRIM(RTRIM(value)) AS owner_mail
            FROM STRING_SPLIT(ISNULL(s.administrators,''), ';')
            WHERE LTRIM(RTRIM(value)) <> ''
        ) sa
        LEFT JOIN dbo.site_owner_status os
            ON os.execution_id = @execution_id AND os.owner_mail = sa.owner_mail
        WHERE s.execution_id = @execution_id
          AND ISNULL(s.site_type,'Site') <> 'Subsite'
          AND (
                (@site_type = 'OneDrive' AND s.site_type = 'OneDrive')
             OR (@site_type <> 'OneDrive' AND ISNULL(s.site_type,'Site') <> 'OneDrive')
              )
        GROUP BY s.site_url, s.site_title, s.storage_used
    )
    SELECT TOP (@top_n)
        ISNULL(site_title, site_url)                     AS site_title,
        site_url,
        CAST(ISNULL(storage_used,0) * 1048576 AS BIGINT)  AS storage_bytes,
        total_owners,
        active_owners
    FROM site_owner_flags
    WHERE active_owners = 0
    ORDER BY storage_bytes DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures da aba Intune — dbo.intune_devices e pequena (1 linha/dispositivo
-- gerenciado, nao por arquivo), consultada direto sem tabela de pre-agregacao.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_intune_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                                          AS total,
        SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END)                                 AS compliant,
        SUM(CASE WHEN ISNULL(compliance_status,'') <> 'compliant' THEN 1 ELSE 0 END)                     AS non_compliant,
        SUM(CASE WHEN ISNULL(is_encrypted,0) = 1 THEN 1 ELSE 0 END)                                      AS encrypted,
        SUM(CASE WHEN ISNULL(is_encrypted,0) = 0 THEN 1 ELSE 0 END)                                      AS not_encrypted,
        SUM(CASE WHEN ISNULL(is_jailbroken,0) = 1 THEN 1 ELSE 0 END)                                     AS jailbroken,
        SUM(CASE WHEN LOWER(ISNULL(antivirus_status,'unknown')) NOT IN ('uptodate','enabled','secured','unknown','notreported') THEN 1 ELSE 0 END) AS antivirus_issue,
        SUM(CASE WHEN ISNULL(has_compliance_risk,0) = 1 OR overall_risk_flag = 'Risco' THEN 1 ELSE 0 END) AS at_risk,
        SUM(CASE WHEN last_checkin_date IS NULL OR last_checkin_date < DATEADD(DAY,-30,SYSUTCDATETIME()) THEN 1 ELSE 0 END) AS stale_30d
    FROM dbo.intune_devices
    WHERE execution_id = @execution_id;
END
GO

CREATE PROCEDURE dbo.sp_dash_intune_by_os
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        ISNULL(NULLIF(os_type,''), 'Desconhecido')                          AS os_type,
        COUNT(*)                                                            AS total,
        SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END)   AS compliant,
        SUM(CASE WHEN ISNULL(is_encrypted,0) = 1 THEN 1 ELSE 0 END)        AS encrypted
    FROM dbo.intune_devices
    WHERE execution_id = @execution_id
    GROUP BY ISNULL(NULLIF(os_type,''), 'Desconhecido')
    ORDER BY total DESC;
END
GO

CREATE PROCEDURE dbo.sp_dash_intune_devices
    @execution_id NVARCHAR(64),
    @top_n        INT = 2000
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        device_name, owner_name, owner_email, os_type, os_version, device_type,
        ISNULL(compliance_status,'unknown')  AS compliance_status,
        ISNULL(is_encrypted,0)               AS is_encrypted,
        ISNULL(is_jailbroken,0)              AS is_jailbroken,
        ISNULL(antivirus_status,'unknown')   AS antivirus_status,
        CASE WHEN ISNULL(has_compliance_risk,0) = 1 OR overall_risk_flag = 'Risco' THEN 1 ELSE 0 END AS has_risk,
        last_checkin_date, model, manufacturer,
        ISNULL(NULLIF(owner_type,''), 'unknown')      AS owner_type,
        ISNULL(NULLIF(enrollment_type,''), 'unknown') AS enrollment_type
    FROM dbo.intune_devices
    WHERE execution_id = @execution_id
    ORDER BY
        CASE WHEN ISNULL(has_compliance_risk,0) = 1 OR overall_risk_flag = 'Risco' THEN 0 ELSE 1 END,
        ISNULL(last_checkin_date, '1900-01-01') ASC;
END
GO

-- sp_dash_intune_by_ownertype — distribuicao Corporate vs Personal (BYOD).
-- managedDeviceOwnerType do Graph: 'company' | 'personal' | 'unknown'.
CREATE PROCEDURE dbo.sp_dash_intune_by_ownertype
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        ISNULL(NULLIF(owner_type,''), 'unknown')                          AS owner_type,
        COUNT(*)                                                          AS total,
        SUM(CASE WHEN compliance_status = 'compliant' THEN 1 ELSE 0 END) AS compliant,
        SUM(CASE WHEN ISNULL(is_encrypted,0) = 1 THEN 1 ELSE 0 END)      AS encrypted
    FROM dbo.intune_devices
    WHERE execution_id = @execution_id
    GROUP BY ISNULL(NULLIF(owner_type,''), 'unknown')
    ORDER BY total DESC;
END
GO

-- sp_dash_intune_compliance_failures — politicas que mais reprovam no tenant
-- (docs/migration_012_intune_compliance_states.sql). Cada linha e 1 politica
-- distinta que apareceu como nonCompliant em pelo menos 1 device.
CREATE PROCEDURE dbo.sp_dash_intune_compliance_failures
    @execution_id NVARCHAR(64),
    @top_n        INT = 20
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        ISNULL(NULLIF(policy_name,''), '(sem nome)') AS policy_name,
        ISNULL(NULLIF(platform_type,''), '—')        AS platform_type,
        COUNT(*)                                      AS device_count
    FROM dbo.intune_compliance_states
    WHERE execution_id = @execution_id
      AND LOWER(ISNULL(state,'')) = 'noncompliant'
    GROUP BY ISNULL(NULLIF(policy_name,''), '(sem nome)'), ISNULL(NULLIF(platform_type,''), '—')
    ORDER BY device_count DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures da aba Licenciamento — dbo.licensing_info e pequena (1 linha por
-- SKU por execucao), consultada direto sem tabela de pre-agregacao.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_licensing_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                  AS total_skus,
        CAST(SUM(ISNULL(total_licenses,0)) AS BIGINT)                            AS total_licenses,
        CAST(SUM(ISNULL(used_licenses,0)) AS BIGINT)                             AS used_licenses,
        CAST(SUM(ISNULL(total_licenses,0)) - SUM(ISNULL(used_licenses,0)) AS BIGINT) AS available_licenses,
        SUM(CASE WHEN ISNULL(total_licenses,0) > 0
                  AND CAST(ISNULL(used_licenses,0) AS FLOAT) / total_licenses < 0.5
                 THEN 1 ELSE 0 END)                                               AS low_utilization_skus,
        SUM(CASE WHEN ISNULL(total_licenses,0) > 0 AND ISNULL(used_licenses,0) >= total_licenses
                 THEN 1 ELSE 0 END)                                               AS fully_used_skus
    FROM dbo.licensing_info
    WHERE execution_id = @execution_id;
END
GO

CREATE PROCEDURE dbo.sp_dash_licensing_by_sku
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        ISNULL(NULLIF(friendly_name,''), ISNULL(NULLIF(sku_part_number,''), '(sem nome)')) AS friendly_name,
        ISNULL(NULLIF(sku_part_number,''), '')                                   AS sku_part_number,
        CAST(ISNULL(total_licenses,0) AS BIGINT)                                 AS total_licenses,
        CAST(ISNULL(used_licenses,0) AS BIGINT)                                  AS used_licenses,
        CAST(ISNULL(total_licenses,0) - ISNULL(used_licenses,0) AS BIGINT)       AS available_licenses,
        CAST(CASE WHEN ISNULL(total_licenses,0) > 0
                  THEN ISNULL(used_licenses,0) * 100.0 / total_licenses
                  ELSE 0 END AS DECIMAL(5,1))                                    AS utilization_pct
    FROM dbo.licensing_info
    WHERE execution_id = @execution_id
    ORDER BY total_licenses DESC;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures da aba Adoção — dbo.user_activity (Get-ActivityInfo.ps1, Graph
-- Reports API, requer permissao Reports.Read.All). "Ativo" = teve atividade
-- registrada nos ultimos 30 dias (nao so "campo preenchido", pra ser robusto
-- a como o Graph populada lastActivityDate entre relatorios/tenants).
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_adoption_by_service
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        service,
        COUNT(*)                                                                                    AS licensed_users,
        SUM(CASE WHEN last_activity_date IS NOT NULL AND last_activity_date >= DATEADD(DAY,-30,SYSUTCDATETIME())
                 THEN 1 ELSE 0 END)                                                                 AS active_users,
        SUM(CASE WHEN last_activity_date IS NULL OR last_activity_date < DATEADD(DAY,-30,SYSUTCDATETIME())
                 THEN 1 ELSE 0 END)                                                                 AS inactive_users
    FROM dbo.user_activity
    WHERE execution_id = @execution_id
      AND ISNULL(is_deleted,0) = 0
    GROUP BY service
    ORDER BY service;
END
GO

-- Top N usuarios licenciados sem atividade recente por servico - candidatos
-- a revisao/remocao de licenca (liga com a aba Licenciamento).
CREATE PROCEDURE dbo.sp_dash_adoption_inactive_users
    @execution_id      NVARCHAR(64),
    @top_n_per_service INT = 15
AS
BEGIN
    SET NOCOUNT ON;
    ;WITH inactive AS (
        SELECT
            service, user_principal_name, last_activity_date,
            ROW_NUMBER() OVER (PARTITION BY service ORDER BY user_principal_name ASC) AS rn
        FROM dbo.user_activity
        WHERE execution_id = @execution_id
          AND ISNULL(is_deleted,0) = 0
          AND (last_activity_date IS NULL OR last_activity_date < DATEADD(DAY,-30,SYSUTCDATETIME()))
    )
    SELECT service, ISNULL(NULLIF(user_principal_name,''), '(sem nome)') AS user_principal_name, last_activity_date
    FROM inactive
    WHERE rn <= @top_n_per_service
    ORDER BY service, user_principal_name;
END
GO

-- ────────────────────────────────────────────────────────────────────────────
-- Procedures da aba Exchange — dbo.mailbox_info (Get-MailboxInfo.ps1, Graph
-- Reports API, requer permissao Reports.Read.All - mesma do Adocao).
-- storage_used_bytes e sempre a caixa ATIVA; has_archive e so indicador
-- booleano (o Graph nao expoe o tamanho numerico do archive - ver comentario
-- no topo de Get-MailboxInfo.ps1). dbo.mailbox_info e pequena (1 linha por
-- usuario por execucao, nao por arquivo) - consultada direto, sem tabela de
-- pre-agregacao, mesmo padrao de licensing_info/intune_devices.
-- ────────────────────────────────────────────────────────────────────────────
CREATE PROCEDURE dbo.sp_dash_mailbox_summary
    @execution_id NVARCHAR(64)
AS
BEGIN
    SET NOCOUNT ON;
    SELECT
        COUNT(*)                                                                     AS total,
        CAST(SUM(ISNULL(storage_used_bytes,0)) AS BIGINT)                            AS storage_total_bytes,
        CAST(AVG(ISNULL(storage_used_bytes,0)) AS BIGINT)                            AS storage_avg_bytes,
        SUM(CASE WHEN has_archive = 1 THEN 1 ELSE 0 END)                             AS with_archive,
        SUM(CASE WHEN prohibit_send_receive_quota_bytes > 0
                  AND storage_used_bytes >= prohibit_send_receive_quota_bytes * 0.9
                 THEN 1 ELSE 0 END)                                                   AS near_quota
    FROM dbo.mailbox_info
    WHERE execution_id = @execution_id
      AND ISNULL(is_deleted,0) = 0;
END
GO

CREATE PROCEDURE dbo.sp_dash_mailbox_list
    @execution_id NVARCHAR(64),
    @top_n        INT = 2000
AS
BEGIN
    SET NOCOUNT ON;
    SELECT TOP (@top_n)
        ISNULL(NULLIF(user_principal_name,''), '(sem UPN)')          AS user_principal_name,
        ISNULL(NULLIF(display_name,''), '')                          AS display_name,
        CAST(ISNULL(item_count,0) AS BIGINT)                         AS item_count,
        CAST(ISNULL(storage_used_bytes,0) AS BIGINT)                 AS storage_used_bytes,
        CAST(ISNULL(prohibit_send_receive_quota_bytes,0) AS BIGINT)  AS quota_bytes,
        CAST(CASE WHEN ISNULL(prohibit_send_receive_quota_bytes,0) > 0
                  THEN storage_used_bytes * 100.0 / prohibit_send_receive_quota_bytes
                  ELSE 0 END AS DECIMAL(5,1))                        AS quota_pct,
        CAST(ISNULL(has_archive,0) AS BIT)                           AS has_archive,
        last_activity_date
    FROM dbo.mailbox_info
    WHERE execution_id = @execution_id
      AND ISNULL(is_deleted,0) = 0
    ORDER BY storage_used_bytes DESC;
END
GO
