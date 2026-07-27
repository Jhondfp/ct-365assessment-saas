-- ======================================
-- LICENSE ANALYSIS SCHEMA
-- ======================================
-- Este script é executado NO BANCO DO TENANT (não no Control Plane)
-- Adiciona tabelas para análise de licenças Microsoft 365

-- ======================================
-- 01. PLANOS DE LICENÇA
-- ======================================
CREATE TABLE license_plans (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id VARCHAR(100) NOT NULL UNIQUE,
    sku_name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    descricao TEXT NULL,
    categoria VARCHAR(50) NOT NULL,
    preco_unitario_brl DECIMAL(10, 2) NULL,
    moeda VARCHAR(3) DEFAULT 'BRL',
    data_atualizacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_license_plans_sku_id ON license_plans(sku_id);
CREATE INDEX idx_license_plans_categoria ON license_plans(categoria);

-- ======================================
-- 02. LICENÇAS POR USUÁRIO
-- ======================================
CREATE TABLE user_licenses (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    sku_id VARCHAR(100) NOT NULL,
    sku_name VARCHAR(255) NOT NULL,
    data_atribuicao TIMESTAMP NULL,
    data_expiracao TIMESTAMP NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired', 'suspended')),
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES od_users(user_id)
);

CREATE INDEX idx_user_licenses_user_id ON user_licenses(user_id);
CREATE INDEX idx_user_licenses_sku_id ON user_licenses(sku_id);
CREATE INDEX idx_user_licenses_status ON user_licenses(status);

-- ======================================
-- 03. SERVIÇOS HABILITADOS POR LICENÇA
-- ======================================
CREATE TABLE license_services (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    sku_id VARCHAR(100) NOT NULL,
    servico_nome VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    habilitado BOOLEAN DEFAULT true,
    data_habilitacao TIMESTAMP NULL,
    data_desabilitacao TIMESTAMP NULL,
    FOREIGN KEY (sku_id) REFERENCES license_plans(sku_id)
);

CREATE INDEX idx_license_services_sku_id ON license_services(sku_id);
CREATE INDEX idx_license_services_servico ON license_services(servico_nome);

-- ======================================
-- 04. UTILIZAÇÃO DE LICENÇAS
-- ======================================
CREATE TABLE license_utilization (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    sku_id VARCHAR(100) NOT NULL,
    ultima_atividade TIMESTAMP NULL,
    dias_inativo INTEGER NULL,
    ativo_30_dias BOOLEAN DEFAULT false,
    ativo_90_dias BOOLEAN DEFAULT false,
    ativo_180_dias BOOLEAN DEFAULT false,
    utilizacao_percentual DECIMAL(5, 2) NULL,
    servicos_utilizados INTEGER NULL,
    ultima_atualizacao TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES od_users(user_id)
);

CREATE INDEX idx_license_utilization_user_id ON license_utilization(user_id);
CREATE INDEX idx_license_utilization_sku_id ON license_utilization(sku_id);
CREATE INDEX idx_license_utilization_dias_inativo ON license_utilization(dias_inativo);

-- ======================================
-- 05. HISTÓRICO DE ATIVIDADE POR SERVIÇO
-- ======================================
CREATE TABLE license_service_activity (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) NOT NULL,
    sku_id VARCHAR(100) NOT NULL,
    servico_nome VARCHAR(100) NOT NULL,
    ultima_atividade TIMESTAMP NULL,
    total_atividades_30_dias INTEGER DEFAULT 0,
    total_atividades_90_dias INTEGER DEFAULT 0,
    ultima_atualizacao TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_service_activity_user_id ON license_service_activity(user_id);
CREATE INDEX idx_service_activity_servico ON license_service_activity(servico_nome);

-- ======================================
-- 06. ANÁLISE DE CUSTOS
-- ======================================
CREATE TABLE license_costs_analysis (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    data_analise TIMESTAMP NOT NULL DEFAULT NOW(),
    total_usuarios INTEGER NULL,
    total_licencas INTEGER NULL,
    total_sku_types INTEGER NULL,
    custo_mensal_estimado_brl DECIMAL(15, 2) NULL,
    custo_anual_estimado_brl DECIMAL(15, 2) NULL,
    custo_por_usuario_brl DECIMAL(10, 2) NULL,
    licencas_ativas INTEGER NULL,
    licencas_inativas INTEGER NULL,
    licencas_subutilizadas INTEGER NULL,
    economia_potencial_mensal_brl DECIMAL(15, 2) NULL,
    economia_potencial_anual_brl DECIMAL(15, 2) NULL,
    taxa_utilizacao_media DECIMAL(5, 2) NULL,
    taxa_atividade_30_dias DECIMAL(5, 2) NULL,
    taxa_atividade_90_dias DECIMAL(5, 2) NULL
);

CREATE INDEX idx_costs_analysis_data ON license_costs_analysis(data_analise);

-- ======================================
-- 07. RECOMENDAÇÕES DE OTIMIZAÇÃO
-- ======================================
CREATE TABLE license_recommendations (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo VARCHAR(50) NOT NULL CHECK (tipo IN ('unused_license', 'downgrade_opportunity', 'upgrade_opportunity', 'service_disabled')),
    severidade VARCHAR(20) NOT NULL CHECK (severidade IN ('high', 'medium', 'low')),
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    economia_potencial_brl DECIMAL(10, 2) NULL,
    usuarios_afetados INTEGER NULL,
    sku_id_afetado VARCHAR(100) NULL,
    sku_alternativo VARCHAR(100) NULL,
    prioridade INTEGER DEFAULT 100,
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW(),
    resolvido BOOLEAN DEFAULT false
);

CREATE INDEX idx_recommendations_tipo ON license_recommendations(tipo);
CREATE INDEX idx_recommendations_severidade ON license_recommendations(severidade);
CREATE INDEX idx_recommendations_resolvido ON license_recommendations(resolvido);

-- ======================================
-- SUMMARY VIEWS
-- ======================================

-- View: Resumo de Licenças por SKU
CREATE VIEW vw_license_summary_by_sku AS
SELECT
    lp.sku_id,
    lp.sku_name,
    lp.display_name,
    lp.categoria,
    COUNT(DISTINCT ul.user_id) as total_usuarios,
    COUNT(DISTINCT ul.id) as total_licencas,
    SUM(CASE WHEN ul.status = 'active' THEN 1 ELSE 0 END) as licencas_ativas,
    SUM(CASE WHEN lu.utilizacao_percentual < 30 THEN 1 ELSE 0 END) as licencas_subutilizadas,
    AVG(CAST(lu.utilizacao_percentual AS FLOAT)) as utilizacao_media,
    SUM(lp.preco_unitario_brl) as custo_mensal_total_brl,
    MAX(ul.coletado_em) as ultima_coleta
FROM license_plans lp
LEFT JOIN user_licenses ul ON lp.sku_id = ul.sku_id
LEFT JOIN license_utilization lu ON ul.user_id = lu.user_id AND ul.sku_id = lu.sku_id
GROUP BY lp.sku_id, lp.sku_name, lp.display_name, lp.categoria;

-- View: Usuarios com Licenças Não Utilizadas
CREATE VIEW vw_unused_licenses AS
SELECT
    ul.id,
    ul.user_email,
    ul.sku_id,
    ul.sku_name,
    ul.data_atribuicao,
    lu.ultima_atividade,
    lu.dias_inativo,
    lu.utilizacao_percentual,
    lp.preco_unitario_brl,
    CASE
        WHEN lu.dias_inativo > 90 THEN 'Critical'
        WHEN lu.dias_inativo > 30 THEN 'High'
        ELSE 'Medium'
    END as prioridade_limpeza
FROM user_licenses ul
LEFT JOIN license_utilization lu ON ul.user_id = lu.user_id
LEFT JOIN license_plans lp ON ul.sku_id = lp.sku_id
WHERE lu.dias_inativo > 30 OR ul.status != 'active';

-- View: Oportunidades de Downgrade
CREATE VIEW vw_downgrade_opportunities AS
SELECT
    ul.user_email,
    ul.sku_id,
    ul.sku_name,
    lu.servicos_utilizados,
    lu.utilizacao_percentual,
    lp.preco_unitario_brl,
    COUNT(ls.servico_nome) as total_servicos_disponiveis
FROM user_licenses ul
JOIN license_utilization lu ON ul.user_id = lu.user_id
JOIN license_plans lp ON ul.sku_id = lp.sku_id
LEFT JOIN license_services ls ON lp.sku_id = ls.sku_id
WHERE lu.utilizacao_percentual < 40 AND lu.servicos_utilizados <= 2
GROUP BY ul.user_email, ul.sku_id, ul.sku_name, lu.servicos_utilizados,
         lu.utilizacao_percentual, lp.preco_unitario_brl;

-- ======================================
-- FUNCTIONS / STORED PROCEDURES
-- ======================================

-- Function: Inserir/Atualizar Plano de Licença
CREATE FUNCTION sp_upsert_license_plan(
    p_sku_id VARCHAR(100),
    p_sku_name VARCHAR(255),
    p_display_name VARCHAR(255),
    p_categoria VARCHAR(50),
    p_preco_unitario_brl DECIMAL(10, 2) DEFAULT NULL
) RETURNS VOID AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM license_plans WHERE sku_id = p_sku_id) THEN
        UPDATE license_plans
        SET sku_name = p_sku_name,
            display_name = p_display_name,
            categoria = p_categoria,
            preco_unitario_brl = p_preco_unitario_brl,
            data_atualizacao = NOW()
        WHERE sku_id = p_sku_id;
    ELSE
        INSERT INTO license_plans (sku_id, sku_name, display_name, categoria, preco_unitario_brl)
        VALUES (p_sku_id, p_sku_name, p_display_name, p_categoria, p_preco_unitario_brl);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Calcular Análise de Custos
CREATE FUNCTION sp_calculate_license_costs_analysis() RETURNS VOID AS $$
BEGIN
    INSERT INTO license_costs_analysis (
        total_usuarios,
        total_licencas,
        total_sku_types,
        custo_mensal_estimado_brl,
        custo_anual_estimado_brl,
        custo_por_usuario_brl,
        licencas_ativas,
        licencas_inativas,
        licencas_subutilizadas,
        economia_potencial_mensal_brl,
        economia_potencial_anual_brl,
        taxa_utilizacao_media,
        taxa_atividade_30_dias,
        taxa_atividade_90_dias
    )
    SELECT
        (SELECT COUNT(DISTINCT user_id) FROM user_licenses),
        (SELECT COUNT(*) FROM user_licenses),
        (SELECT COUNT(DISTINCT sku_id) FROM license_plans),
        (SELECT SUM(preco_unitario_brl) FROM license_plans
         WHERE sku_id IN (SELECT DISTINCT sku_id FROM user_licenses)),
        (SELECT SUM(preco_unitario_brl) * 12 FROM license_plans
         WHERE sku_id IN (SELECT DISTINCT sku_id FROM user_licenses)),
        (SELECT AVG(preco_unitario_brl) FROM license_plans
         WHERE sku_id IN (SELECT DISTINCT sku_id FROM user_licenses)),
        (SELECT COUNT(*) FROM user_licenses WHERE status = 'active'),
        (SELECT COUNT(*) FROM user_licenses WHERE status != 'active'),
        (SELECT COUNT(*) FROM license_utilization WHERE utilizacao_percentual < 30),
        (SELECT SUM(preco_unitario_brl) * 0.3 FROM license_plans
         WHERE sku_id IN (SELECT sku_id FROM license_utilization WHERE utilizacao_percentual < 30)),
        (SELECT SUM(preco_unitario_brl) * 0.3 * 12 FROM license_plans
         WHERE sku_id IN (SELECT sku_id FROM license_utilization WHERE utilizacao_percentual < 30)),
        (SELECT AVG(utilizacao_percentual) FROM license_utilization),
        (SELECT CAST(SUM(CASE WHEN ativo_30_dias THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 FROM license_utilization),
        (SELECT CAST(SUM(CASE WHEN ativo_90_dias THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100 FROM license_utilization);
END;
$$ LANGUAGE plpgsql;

-- Function: Gerar Recomendações de Otimização
CREATE FUNCTION sp_generate_license_recommendations() RETURNS VOID AS $$
BEGIN
    DELETE FROM license_recommendations;

    -- Recomendação: Licenças não utilizadas por 90+ dias
    INSERT INTO license_recommendations
        (tipo, severidade, titulo, descricao, economia_potencial_brl, usuarios_afetados, sku_id_afetado, prioridade)
    SELECT
        'unused_license',
        'high',
        'Licença não utilizada por ' || lu.dias_inativo::VARCHAR || ' dias',
        'Usuário ' || ul.user_email || ' possui ' || ul.sku_name || ' mas não a utiliza há ' || lu.dias_inativo::VARCHAR || ' dias',
        lp.preco_unitario_brl,
        1,
        ul.sku_id,
        CASE WHEN lu.dias_inativo > 90 THEN 1 WHEN lu.dias_inativo > 60 THEN 2 ELSE 3 END
    FROM user_licenses ul
    JOIN license_utilization lu ON ul.user_id = lu.user_id
    JOIN license_plans lp ON ul.sku_id = lp.sku_id
    WHERE lu.dias_inativo > 30;

    -- Recomendação: Oportunidades de downgrade
    INSERT INTO license_recommendations
        (tipo, severidade, titulo, descricao, economia_potencial_brl, usuarios_afetados, sku_id_afetado, prioridade)
    SELECT
        'downgrade_opportunity',
        'medium',
        'Oportunidade de downgrade para ' || ul.user_email,
        'Usuário utiliza apenas ' || lu.servicos_utilizados::VARCHAR || ' de ' ||
        COUNT(*)::VARCHAR || ' serviços disponíveis na licença ' || ul.sku_name,
        lp.preco_unitario_brl * 0.4,
        1,
        ul.sku_id,
        2
    FROM user_licenses ul
    JOIN license_utilization lu ON ul.user_id = lu.user_id
    JOIN license_plans lp ON ul.sku_id = lp.sku_id
    LEFT JOIN license_services ls ON lp.sku_id = ls.sku_id
    WHERE lu.servicos_utilizados <= 2 AND lu.utilizacao_percentual < 40
    GROUP BY ul.user_email, ul.sku_name, ul.sku_id, lu.servicos_utilizados,
             lp.preco_unitario_brl;
END;
$$ LANGUAGE plpgsql;
