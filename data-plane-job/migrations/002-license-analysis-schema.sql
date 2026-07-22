-- ======================================
-- LICENSE ANALYSIS SCHEMA
-- ======================================
-- Este script é executado NO BANCO DO TENANT (não no Control Plane)
-- Adiciona tabelas para análise de licenças Microsoft 365

-- ======================================
-- 01. PLANOS DE LICENÇA
-- ======================================
CREATE TABLE [dbo].[license_plans] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [sku_id] NVARCHAR(100) NOT NULL UNIQUE,
    [sku_name] NVARCHAR(255) NOT NULL,
    [display_name] NVARCHAR(255) NOT NULL,
    [descricao] NVARCHAR(MAX) NULL,
    [categoria] NVARCHAR(50) NOT NULL, -- 'Microsoft 365', 'Teams', 'Exchange', 'SharePoint'
    [preco_unitario_brl] DECIMAL(10, 2) NULL,
    [moeda] VARCHAR(3) DEFAULT 'BRL',
    [data_atualizacao] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_license_plans_sku_id] ON [dbo].[license_plans]([sku_id]);
CREATE INDEX [idx_license_plans_categoria] ON [dbo].[license_plans]([categoria]);

-- ======================================
-- 02. LICENÇAS POR USUÁRIO
-- ======================================
CREATE TABLE [dbo].[user_licenses] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [user_id] NVARCHAR(255) NOT NULL,
    [user_email] NVARCHAR(255) NOT NULL,
    [sku_id] NVARCHAR(100) NOT NULL,
    [sku_name] NVARCHAR(255) NOT NULL,
    [data_atribuicao] DATETIME2 NULL,
    [data_expiracao] DATETIME2 NULL,
    [status] VARCHAR(20) DEFAULT 'active' CHECK ([status] IN ('active', 'inactive', 'expired', 'suspended')),
    [coletado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[od_users]([user_id])
);

CREATE INDEX [idx_user_licenses_user_id] ON [dbo].[user_licenses]([user_id]);
CREATE INDEX [idx_user_licenses_sku_id] ON [dbo].[user_licenses]([sku_id]);
CREATE INDEX [idx_user_licenses_status] ON [dbo].[user_licenses]([status]);

-- ======================================
-- 03. SERVIÇOS HABILITADOS POR LICENÇA
-- ======================================
CREATE TABLE [dbo].[license_services] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [sku_id] NVARCHAR(100) NOT NULL,
    [servico_nome] NVARCHAR(100) NOT NULL, -- 'Exchange', 'SharePoint', 'Teams', 'OneDrive', 'PowerBI', etc
    [display_name] NVARCHAR(255) NOT NULL,
    [habilitado] BIT DEFAULT 1,
    [data_habilitacao] DATETIME2 NULL,
    [data_desabilitacao] DATETIME2 NULL,
    FOREIGN KEY ([sku_id]) REFERENCES [dbo].[license_plans]([sku_id])
);

CREATE INDEX [idx_license_services_sku_id] ON [dbo].[license_services]([sku_id]);
CREATE INDEX [idx_license_services_servico] ON [dbo].[license_services]([servico_nome]);

-- ======================================
-- 04. UTILIZAÇÃO DE LICENÇAS
-- ======================================
CREATE TABLE [dbo].[license_utilization] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [user_id] NVARCHAR(255) NOT NULL,
    [user_email] NVARCHAR(255) NOT NULL,
    [sku_id] NVARCHAR(100) NOT NULL,
    [ultima_atividade] DATETIME2 NULL,
    [dias_inativo] INT NULL,
    [ativo_30_dias] BIT DEFAULT 0,
    [ativo_90_dias] BIT DEFAULT 0,
    [ativo_180_dias] BIT DEFAULT 0,
    [utilizacao_percentual] DECIMAL(5, 2) NULL, -- 0-100
    [servicos_utilizados] INT NULL, -- Quantos serviços da licença estão sendo usados
    [ultima_atualizacao] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([user_id]) REFERENCES [dbo].[od_users]([user_id])
);

CREATE INDEX [idx_license_utilization_user_id] ON [dbo].[license_utilization]([user_id]);
CREATE INDEX [idx_license_utilization_sku_id] ON [dbo].[license_utilization]([sku_id]);
CREATE INDEX [idx_license_utilization_dias_inativo] ON [dbo].[license_utilization]([dias_inativo]);

-- ======================================
-- 05. HISTÓRICO DE ATIVIDADE POR SERVIÇO
-- ======================================
CREATE TABLE [dbo].[license_service_activity] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [user_id] NVARCHAR(255) NOT NULL,
    [sku_id] NVARCHAR(100) NOT NULL,
    [servico_nome] NVARCHAR(100) NOT NULL,
    [ultima_atividade] DATETIME2 NULL,
    [total_atividades_30_dias] INT DEFAULT 0,
    [total_atividades_90_dias] INT DEFAULT 0,
    [ultima_atualizacao] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_service_activity_user_id] ON [dbo].[license_service_activity]([user_id]);
CREATE INDEX [idx_service_activity_servico] ON [dbo].[license_service_activity]([servico_nome]);

-- ======================================
-- 06. ANÁLISE DE CUSTOS
-- ======================================
CREATE TABLE [dbo].[license_costs_analysis] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [data_analise] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [total_usuarios] INT NULL,
    [total_licencas] INT NULL,
    [total_sku_types] INT NULL,
    [custo_mensal_estimado_brl] DECIMAL(15, 2) NULL,
    [custo_anual_estimado_brl] DECIMAL(15, 2) NULL,
    [custo_por_usuario_brl] DECIMAL(10, 2) NULL,
    [licencas_ativas] INT NULL,
    [licencas_inativas] INT NULL,
    [licencas_subutilizadas] INT NULL,
    [economia_potencial_mensal_brl] DECIMAL(15, 2) NULL,
    [economia_potencial_anual_brl] DECIMAL(15, 2) NULL,
    [taxa_utilizacao_media] DECIMAL(5, 2) NULL,
    [taxa_atividade_30_dias] DECIMAL(5, 2) NULL,
    [taxa_atividade_90_dias] DECIMAL(5, 2) NULL
);

CREATE INDEX [idx_costs_analysis_data] ON [dbo].[license_costs_analysis]([data_analise]);

-- ======================================
-- 07. RECOMENDAÇÕES DE OTIMIZAÇÃO
-- ======================================
CREATE TABLE [dbo].[license_recommendations] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [tipo] VARCHAR(50) NOT NULL CHECK ([tipo] IN ('unused_license', 'downgrade_opportunity', 'upgrade_opportunity', 'service_disabled')),
    [severidade] VARCHAR(20) NOT NULL CHECK ([severidade] IN ('high', 'medium', 'low')),
    [titulo] NVARCHAR(255) NOT NULL,
    [descricao] NVARCHAR(MAX) NOT NULL,
    [economia_potencial_brl] DECIMAL(10, 2) NULL,
    [usuarios_afetados] INT NULL,
    [sku_id_afetado] NVARCHAR(100) NULL,
    [sku_alternativo] NVARCHAR(100) NULL,
    [prioridade] INT DEFAULT 100,
    [data_criacao] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [resolvido] BIT DEFAULT 0
);

CREATE INDEX [idx_recommendations_tipo] ON [dbo].[license_recommendations]([tipo]);
CREATE INDEX [idx_recommendations_severidade] ON [dbo].[license_recommendations]([severidade]);
CREATE INDEX [idx_recommendations_resolvido] ON [dbo].[license_recommendations]([resolvido]);

-- ======================================
-- SUMMARY VIEWS
-- ======================================

-- View: Resumo de Licenças por SKU
CREATE VIEW [dbo].[vw_license_summary_by_sku] AS
SELECT
    lp.[sku_id],
    lp.[sku_name],
    lp.[display_name],
    lp.[categoria],
    COUNT(DISTINCT ul.user_id) as total_usuarios,
    COUNT(DISTINCT ul.id) as total_licencas,
    SUM(CASE WHEN ul.[status] = 'active' THEN 1 ELSE 0 END) as licencas_ativas,
    SUM(CASE WHEN lu.[utilizacao_percentual] < 30 THEN 1 ELSE 0 END) as licencas_subutilizadas,
    AVG(CAST(lu.[utilizacao_percentual] AS FLOAT)) as utilizacao_media,
    SUM(lp.[preco_unitario_brl]) as custo_mensal_total_brl,
    MAX(ul.[coletado_em]) as ultima_coleta
FROM [dbo].[license_plans] lp
LEFT JOIN [dbo].[user_licenses] ul ON lp.[sku_id] = ul.[sku_id]
LEFT JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id] AND ul.[sku_id] = lu.[sku_id]
GROUP BY lp.[sku_id], lp.[sku_name], lp.[display_name], lp.[categoria]
;

-- View: Usuarios com Licenças Não Utilizadas
CREATE VIEW [dbo].[vw_unused_licenses] AS
SELECT
    ul.[id],
    ul.[user_email],
    ul.[sku_id],
    ul.[sku_name],
    ul.[data_atribuicao],
    lu.[ultima_atividade],
    lu.[dias_inativo],
    lu.[utilizacao_percentual],
    lp.[preco_unitario_brl],
    CASE
        WHEN lu.[dias_inativo] > 90 THEN 'Critical'
        WHEN lu.[dias_inativo] > 30 THEN 'High'
        ELSE 'Medium'
    END as prioridade_limpeza
FROM [dbo].[user_licenses] ul
LEFT JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id]
LEFT JOIN [dbo].[license_plans] lp ON ul.[sku_id] = lp.[sku_id]
WHERE lu.[dias_inativo] > 30 OR ul.[status] != 'active'
;

-- View: Oportunidades de Downgrade
CREATE VIEW [dbo].[vw_downgrade_opportunities] AS
SELECT
    ul.[user_email],
    ul.[sku_id],
    ul.[sku_name],
    lu.[servicos_utilizados],
    lu.[utilizacao_percentual],
    lp.[preco_unitario_brl],
    COUNT(ls.[servico_nome]) as total_servicos_disponiveis
FROM [dbo].[user_licenses] ul
JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id]
JOIN [dbo].[license_plans] lp ON ul.[sku_id] = lp.[sku_id]
LEFT JOIN [dbo].[license_services] ls ON lp.[sku_id] = ls.[sku_id]
WHERE lu.[utilizacao_percentual] < 40 AND lu.[servicos_utilizados] <= 2
GROUP BY ul.[user_email], ul.[sku_id], ul.[sku_name], lu.[servicos_utilizados],
         lu.[utilizacao_percentual], lp.[preco_unitario_brl]
;

-- ======================================
-- STORED PROCEDURES
-- ======================================

-- Procedure: Inserir/Atualizar Plano de Licença
CREATE PROCEDURE [dbo].[sp_UpsertLicensePlan]
    @SkuId NVARCHAR(100),
    @SkuName NVARCHAR(255),
    @DisplayName NVARCHAR(255),
    @Categoria NVARCHAR(50),
    @PrecoUnitarioBrl DECIMAL(10, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    IF EXISTS (SELECT 1 FROM [dbo].[license_plans] WHERE [sku_id] = @SkuId)
    BEGIN
        UPDATE [dbo].[license_plans]
        SET [sku_name] = @SkuName,
            [display_name] = @DisplayName,
            [categoria] = @Categoria,
            [preco_unitario_brl] = @PrecoUnitarioBrl,
            [data_atualizacao] = GETUTCDATE()
        WHERE [sku_id] = @SkuId;
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[license_plans] ([sku_id], [sku_name], [display_name], [categoria], [preco_unitario_brl])
        VALUES (@SkuId, @SkuName, @DisplayName, @Categoria, @PrecoUnitarioBrl);
    END
END;

-- Procedure: Calcular Análise de Custos
CREATE PROCEDURE [dbo].[sp_CalculateLicenseCostsAnalysis]
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO [dbo].[license_costs_analysis] (
        [total_usuarios],
        [total_licencas],
        [total_sku_types],
        [custo_mensal_estimado_brl],
        [custo_anual_estimado_brl],
        [custo_por_usuario_brl],
        [licencas_ativas],
        [licencas_inativas],
        [licencas_subutilizadas],
        [economia_potencial_mensal_brl],
        [economia_potencial_anual_brl],
        [taxa_utilizacao_media],
        [taxa_atividade_30_dias],
        [taxa_atividade_90_dias]
    )
    SELECT
        (SELECT COUNT(DISTINCT [user_id]) FROM [dbo].[user_licenses]),
        (SELECT COUNT(*) FROM [dbo].[user_licenses]),
        (SELECT COUNT(DISTINCT [sku_id]) FROM [dbo].[license_plans]),
        (SELECT SUM([preco_unitario_brl]) FROM [dbo].[license_plans]
         WHERE [sku_id] IN (SELECT DISTINCT [sku_id] FROM [dbo].[user_licenses])),
        (SELECT SUM([preco_unitario_brl]) * 12 FROM [dbo].[license_plans]
         WHERE [sku_id] IN (SELECT DISTINCT [sku_id] FROM [dbo].[user_licenses])),
        (SELECT AVG([preco_unitario_brl]) FROM [dbo].[license_plans]
         WHERE [sku_id] IN (SELECT DISTINCT [sku_id] FROM [dbo].[user_licenses])),
        (SELECT COUNT(*) FROM [dbo].[user_licenses] WHERE [status] = 'active'),
        (SELECT COUNT(*) FROM [dbo].[user_licenses] WHERE [status] != 'active'),
        (SELECT COUNT(*) FROM [dbo].[license_utilization] WHERE [utilizacao_percentual] < 30),
        (SELECT SUM([preco_unitario_brl]) * 0.3 FROM [dbo].[license_plans]
         WHERE [sku_id] IN (SELECT [sku_id] FROM [dbo].[license_utilization] WHERE [utilizacao_percentual] < 30)),
        (SELECT SUM([preco_unitario_brl]) * 0.3 * 12 FROM [dbo].[license_plans]
         WHERE [sku_id] IN (SELECT [sku_id] FROM [dbo].[license_utilization] WHERE [utilizacao_percentual] < 30)),
        (SELECT AVG([utilizacao_percentual]) FROM [dbo].[license_utilization]),
        (SELECT CAST(SUM(CASE WHEN [ativo_30_dias] = 1 THEN 1 ELSE 0 END)
                     AS FLOAT) / COUNT(*) * 100 FROM [dbo].[license_utilization]),
        (SELECT CAST(SUM(CASE WHEN [ativo_90_dias] = 1 THEN 1 ELSE 0 END)
                     AS FLOAT) / COUNT(*) * 100 FROM [dbo].[license_utilization]);
END;

-- Procedure: Gerar Recomendações de Otimização
CREATE PROCEDURE [dbo].[sp_GenerateLicenseRecommendations]
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM [dbo].[license_recommendations];

    -- Recomendação: Licenças não utilizadas por 90+ dias
    INSERT INTO [dbo].[license_recommendations]
        ([tipo], [severidade], [titulo], [descricao], [economia_potencial_brl], [usuarios_afetados], [sku_id_afetado], [prioridade])
    SELECT
        'unused_license',
        'high',
        'Licença não utilizada por ' + CAST(lu.[dias_inativo] AS NVARCHAR(10)) + ' dias',
        'Usuário ' + ul.[user_email] + ' possui ' + ul.[sku_name] + ' mas não a utiliza há ' + CAST(lu.[dias_inativo] AS NVARCHAR(10)) + ' dias',
        lp.[preco_unitario_brl],
        1,
        ul.[sku_id],
        CASE WHEN lu.[dias_inativo] > 90 THEN 1 WHEN lu.[dias_inativo] > 60 THEN 2 ELSE 3 END
    FROM [dbo].[user_licenses] ul
    JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id]
    JOIN [dbo].[license_plans] lp ON ul.[sku_id] = lp.[sku_id]
    WHERE lu.[dias_inativo] > 30;

    -- Recomendação: Oportunidades de downgrade
    INSERT INTO [dbo].[license_recommendations]
        ([tipo], [severidade], [titulo], [descricao], [economia_potencial_brl], [usuarios_afetados], [sku_id_afetado], [prioridade])
    SELECT
        'downgrade_opportunity',
        'medium',
        'Oportunidade de downgrade para ' + ul.[user_email],
        'Usuário utiliza apenas ' + CAST(lu.[servicos_utilizados] AS NVARCHAR(5)) + ' de ' +
        CAST(COUNT(*) AS NVARCHAR(5)) + ' serviços disponíveis na licença ' + ul.[sku_name],
        lp.[preco_unitario_brl] * 0.4,
        1,
        ul.[sku_id],
        2
    FROM [dbo].[user_licenses] ul
    JOIN [dbo].[license_utilization] lu ON ul.[user_id] = lu.[user_id]
    JOIN [dbo].[license_plans] lp ON ul.[sku_id] = lp.[sku_id]
    LEFT JOIN [dbo].[license_services] ls ON lp.[sku_id] = ls.[sku_id]
    WHERE lu.[servicos_utilizados] <= 2 AND lu.[utilizacao_percentual] < 40
    GROUP BY ul.[user_email], ul.[sku_name], ul.[sku_id], lu.[servicos_utilizados],
             lp.[preco_unitario_brl];
END;
