-- ============================================================================
-- 004 — AWS: levantamento para migração ao Azure.
-- Idempotente (só cria o que não existe). Gravado por job/aws/*.ps1; a coleta usa
-- dbo.execution_history como as demais (mesmo execution_id do portal).
-- ============================================================================

IF OBJECT_ID('dbo.aws_accounts', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_accounts (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_accounts PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        account_id   NVARCHAR(16)  NOT NULL,
        name         NVARCHAR(256) NULL,
        email        NVARCHAR(320) NULL,
        status       NVARCHAR(32)  NULL,
        is_current   BIT           NULL       -- conta da chave usada na coleta
    );
    CREATE INDEX IX_aws_accounts_exec ON dbo.aws_accounts (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_summary', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_summary (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_summary PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        account_id   NVARCHAR(16)  NULL,
        item         NVARCHAR(128) NOT NULL,  -- iam.Users, iam.AccountMFAEnabled, regions…
        value        NVARCHAR(2000) NULL
    );
    CREATE INDEX IX_aws_summary_exec ON dbo.aws_summary (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_instances', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_instances (
        id               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_instances PRIMARY KEY,
        execution_id     NVARCHAR(64)   NOT NULL,
        account_id       NVARCHAR(16)   NULL,
        region           NVARCHAR(32)   NULL,
        instance_id      NVARCHAR(64)   NOT NULL,
        name             NVARCHAR(256)  NULL,
        instance_type    NVARCHAR(64)   NULL,
        vcpu             INT            NULL,
        memory_mib       INT            NULL,
        burstable        BIT            NULL,
        state            NVARCHAR(32)   NULL,
        platform         NVARCHAR(16)   NULL,   -- windows | linux
        platform_details NVARCHAR(256)  NULL,   -- ex.: Windows with SQL Server Standard
        launch_time      DATETIME2      NULL,
        state_reason     NVARCHAR(512)  NULL,   -- ex.: User initiated (2026-01-10 …) quando parada
        vpc_id           NVARCHAR(64)   NULL,
        public_ip        BIT            NULL,
        cpu_avg          DECIMAL(6,2)   NULL,   -- CloudWatch, 30 dias
        cpu_max          DECIMAL(6,2)   NULL,
        app_tag          NVARCHAR(256)  NULL,
        env_tag          NVARCHAR(128)  NULL,
        tags             NVARCHAR(4000) NULL
    );
    CREATE INDEX IX_aws_instances_exec ON dbo.aws_instances (execution_id, instance_id);
END
GO

IF OBJECT_ID('dbo.aws_services', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_services (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_services PRIMARY KEY,
        execution_id NVARCHAR(64)   NOT NULL,
        account_id   NVARCHAR(16)   NULL,
        region       NVARCHAR(32)   NULL,
        kind         NVARCHAR(32)   NOT NULL,  -- lambda | ecs | eks | asg
        name         NVARCHAR(512)  NULL,
        detail       NVARCHAR(1024) NULL,
        size_bytes   BIGINT         NULL,
        count_value  INT            NULL
    );
    CREATE INDEX IX_aws_services_exec ON dbo.aws_services (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_volumes', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_volumes (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_volumes PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        account_id   NVARCHAR(16)  NULL,
        region       NVARCHAR(32)  NULL,
        volume_id    NVARCHAR(64)  NOT NULL,
        size_gb      INT           NULL,
        volume_type  NVARCHAR(16)  NULL,       -- gp2 | gp3 | io1 | io2 | st1 | sc1 | standard | efs
        iops         INT           NULL,
        throughput   INT           NULL,
        attached     BIT           NULL,
        instance_id  NVARCHAR(64)  NULL,
        encrypted    BIT           NULL
    );
    CREATE INDEX IX_aws_volumes_exec ON dbo.aws_volumes (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_buckets', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_buckets (
        id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_buckets PRIMARY KEY,
        execution_id   NVARCHAR(64)  NOT NULL,
        account_id     NVARCHAR(16)  NULL,
        region         NVARCHAR(32)  NULL,
        bucket_name    NVARCHAR(256) NOT NULL,
        created        DATETIME2     NULL,
        size_bytes     BIGINT        NULL,
        standard_bytes BIGINT        NULL,
        ia_bytes       BIGINT        NULL,
        archive_bytes  BIGINT        NULL,
        objects        BIGINT        NULL
    );
    CREATE INDEX IX_aws_buckets_exec ON dbo.aws_buckets (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_databases', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_databases (
        id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_databases PRIMARY KEY,
        execution_id   NVARCHAR(64)  NOT NULL,
        account_id     NVARCHAR(16)  NULL,
        region         NVARCHAR(32)  NULL,
        kind           NVARCHAR(16)  NOT NULL,  -- rds | dynamodb | elasticache
        identifier     NVARCHAR(256) NOT NULL,
        engine         NVARCHAR(64)  NULL,
        engine_version NVARCHAR(64)  NULL,
        instance_class NVARCHAR(64)  NULL,
        vcpu           INT           NULL,
        memory_mib     INT           NULL,
        storage_gb     DECIMAL(18,2) NULL,
        multi_az       BIT           NULL,
        license_model  NVARCHAR(64)  NULL,
        status         NVARCHAR(64)  NULL
    );
    CREATE INDEX IX_aws_databases_exec ON dbo.aws_databases (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_network', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_network (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_network PRIMARY KEY,
        execution_id NVARCHAR(64)   NOT NULL,
        account_id   NVARCHAR(16)   NULL,
        region       NVARCHAR(32)   NULL,
        kind         NVARCHAR(32)   NOT NULL,  -- vpc | vpn | nat | tgw | lb-application | lb-network | lb-classic | directconnect | route53 | cloudfront
        resource_id  NVARCHAR(256)  NULL,
        name         NVARCHAR(512)  NULL,
        detail       NVARCHAR(1024) NULL
    );
    CREATE INDEX IX_aws_network_exec ON dbo.aws_network (execution_id);
END
GO

IF OBJECT_ID('dbo.aws_costs', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.aws_costs (
        id           BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_aws_costs PRIMARY KEY,
        execution_id NVARCHAR(64)  NOT NULL,
        account_id   NVARCHAR(16)  NULL,
        month        DATE          NOT NULL,
        service      NVARCHAR(256) NOT NULL,
        amount       DECIMAL(18,2) NULL,
        currency     NVARCHAR(8)   NULL
    );
    CREATE INDEX IX_aws_costs_exec ON dbo.aws_costs (execution_id);
END
GO
