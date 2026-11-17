-- ============================================================================
-- 002 — Higienização: registro das execuções e de cada item tratado.
-- Idempotente (só cria o que não existe). Usado por job/hygiene/*.ps1.
-- ============================================================================

IF OBJECT_ID('dbo.hygiene_runs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.hygiene_runs (
        run_id               NVARCHAR(64)  NOT NULL,
        action               NVARCHAR(32)  NOT NULL,   -- version_cleanup
        mode                 NVARCHAR(32)  NOT NULL,   -- PorArquivo | JobSharePoint
        dry_run              BIT           NOT NULL,   -- 1 = simulação (nada alterado)
        keep_versions        INT           NULL,
        recycle              BIT           NULL,       -- PorArquivo: versões apagadas vão para a lixeira
        source_execution_id  NVARCHAR(64)  NULL,       -- coleta usada para escolher os candidatos
        started_at           DATETIME2     NOT NULL,
        finished_at          DATETIME2     NULL,
        status               NVARCHAR(32)  NOT NULL,   -- running | completed | partial | failed
        sites                INT           NULL,
        files_targeted       INT           NULL,
        files_changed        INT           NULL,
        versions_deleted     BIGINT        NULL,
        bytes_freed          BIGINT        NULL,
        errors               INT           NULL,
        CONSTRAINT PK_hygiene_runs PRIMARY KEY (run_id)
    );
END
GO

IF OBJECT_ID('dbo.hygiene_version_items', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.hygiene_version_items (
        id                BIGINT IDENTITY(1,1) NOT NULL,
        run_id            NVARCHAR(64)   NOT NULL,
        site_url          NVARCHAR(512)  NULL,
        file_url          NVARCHAR(MAX)  NULL,
        versions_before   INT            NULL,   -- versões históricas reais (sem contar a atual)
        versions_deleted  INT            NULL,   -- apagadas (ou que seriam, na simulação)
        bytes             BIGINT         NULL,   -- espaço liberado (ou estimado, na simulação)
        status            NVARCHAR(32)   NOT NULL, -- simulado | removido | sem_excesso | protegido | erro | job_enfileirado
        detail            NVARCHAR(MAX)  NULL,
        processed_at      DATETIME2      NOT NULL CONSTRAINT DF_hygiene_items_at DEFAULT SYSUTCDATETIME(),
        CONSTRAINT PK_hygiene_version_items PRIMARY KEY (id)
    );
    CREATE NONCLUSTERED INDEX IX_hygiene_items_run ON dbo.hygiene_version_items (run_id);
END
GO
