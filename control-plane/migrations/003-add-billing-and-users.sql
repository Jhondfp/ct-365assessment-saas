-- ======================================
-- MIGRATION: Billing, Credits, Users, App Registration
-- ======================================

-- ======================================
-- 01. APP REGISTRATION (Multi-Tenant)
-- ======================================
CREATE TABLE app_registrations (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    app_id VARCHAR(36) NOT NULL UNIQUE,
    app_secret TEXT NOT NULL,
    app_secret_key_vault_id VARCHAR(255) NULL,
    redirect_uri VARCHAR(2048) NOT NULL,
    scopes JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'expired')),
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMP NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_app_registrations_tenant_id ON app_registrations(tenant_id);
CREATE INDEX idx_app_registrations_app_id ON app_registrations(app_id);
CREATE INDEX idx_app_registrations_status ON app_registrations(status);

-- ======================================
-- 02. CRÉDITOS (Billing/Consumption)
-- ======================================
CREATE TABLE credit_plans (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL UNIQUE,
    descricao TEXT NULL,
    creditos_inclusos DECIMAL(15, 2) NOT NULL,
    valor_mensal_brl DECIMAL(10, 2) NOT NULL,
    valor_credito_excedente_brl DECIMAL(10, 4) NOT NULL,
    limite_usuarios INTEGER NULL,
    limite_assessments_mes INTEGER NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_credit_plans_ativo ON credit_plans(ativo);

-- Inserir planos padrão
INSERT INTO credit_plans (nome, descricao, creditos_inclusos, valor_mensal_brl, valor_credito_excedente_brl, limite_usuarios, limite_assessments_mes)
VALUES
    ('Starter', 'Para equipes pequenas', 10, 99.00, 0.50, 3, 5),
    ('Professional', 'Para departamentos', 50, 299.00, 0.40, 10, 20),
    ('Enterprise', 'Solução customizada', 500, 999.00, 0.30, NULL, NULL);

-- Créditos por cliente
CREATE TABLE client_credits (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    plan_id UUID NOT NULL,
    creditos_saldo DECIMAL(15, 2) NOT NULL DEFAULT 0,
    creditos_consumidos_mes DECIMAL(15, 2) NOT NULL DEFAULT 0,
    data_renovacao_creditos TIMESTAMP NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES credit_plans(id)
);

CREATE INDEX idx_client_credits_client_id ON client_credits(client_id);
CREATE INDEX idx_client_credits_ativo ON client_credits(ativo);

-- Histórico de transações de crédito
CREATE TABLE credit_transactions (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    execution_id UUID NULL,
    tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('purchase', 'consumption', 'refund', 'adjustment', 'renewal')),
    creditos_alterados DECIMAL(15, 2) NOT NULL,
    saldo_anterior DECIMAL(15, 2) NOT NULL,
    saldo_novo DECIMAL(15, 2) NOT NULL,
    descricao TEXT NULL,
    criado_por UUID NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (execution_id) REFERENCES executions(id),
    FOREIGN KEY (criado_por) REFERENCES users(id)
);

CREATE INDEX idx_credit_transactions_client_id ON credit_transactions(client_id);
CREATE INDEX idx_credit_transactions_type ON credit_transactions(tipo);
CREATE INDEX idx_credit_transactions_execution_id ON credit_transactions(execution_id);

-- ======================================
-- 03. USUÁRIOS (Admin + Customer)
-- ======================================
ALTER TABLE users
ADD tipo VARCHAR(20) DEFAULT 'admin' CHECK (tipo IN ('admin', 'customer')),
    client_id UUID NULL,
    cargo VARCHAR(255) NULL,
    telefone VARCHAR(20) NULL,
    foto_url VARCHAR(2048) NULL,
    idioma VARCHAR(10) DEFAULT 'pt-BR' CHECK (idioma IN ('pt-BR', 'en-US', 'es-ES')),
    timezone VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    notificacoes_email BOOLEAN DEFAULT true,
    notificacoes_sms BOOLEAN DEFAULT false;

ALTER TABLE users
ADD CONSTRAINT fk_users_client
FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;

CREATE INDEX idx_users_client_id ON users(client_id);
CREATE INDEX idx_users_tipo ON users(tipo);

-- ======================================
-- 04. CONVITES DE USUÁRIOS
-- ======================================
CREATE TABLE user_invites (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    email VARCHAR(255) NOT NULL,
    papel VARCHAR(20) NOT NULL CHECK (papel IN ('superadmin', 'analista', 'viewer', 'viewer_cliente')),
    token VARCHAR(255) NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
    criado_por UUID NOT NULL,
    aceito_em TIMESTAMP NULL,
    expira_em TIMESTAMP NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (criado_por) REFERENCES users(id)
);

CREATE INDEX idx_user_invites_client_id ON user_invites(client_id);
CREATE INDEX idx_user_invites_status ON user_invites(status);
CREATE INDEX idx_user_invites_token ON user_invites(token);

-- ======================================
-- 05. ATUALIZAR EXECUTIONS COM CUSTO
-- ======================================
ALTER TABLE executions
ADD creditos_utilizados DECIMAL(15, 2) NULL,
    creditos_custo_calculation JSONB NULL;

-- ======================================
-- 06. CONSUMO DE CRÉDITOS (Histórico)
-- ======================================
CREATE TABLE consumo_assessments (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    execution_id UUID NOT NULL,
    gb_processado DECIMAL(15, 2) NOT NULL,
    creditos_utilizados DECIMAL(15, 2) NOT NULL,
    valor_credito_unitario DECIMAL(10, 4) NOT NULL,
    data_assessment TIMESTAMP NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(id),
    FOREIGN KEY (execution_id) REFERENCES executions(id)
);

CREATE INDEX idx_consumo_assessments_client_id ON consumo_assessments(client_id);
CREATE INDEX idx_consumo_assessments_execution_id ON consumo_assessments(execution_id);
CREATE INDEX idx_consumo_assessments_data ON consumo_assessments(data_assessment);

-- ======================================
-- 07. ARMAZÉM DE DADOS (Relatórios)
-- ======================================
CREATE TABLE faturas (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    numero_nf VARCHAR(50) NOT NULL UNIQUE,
    mes_referencia VARCHAR(7) NOT NULL,
    creditos_consumidos DECIMAL(15, 2) NOT NULL,
    creditos_inclusos_plano DECIMAL(15, 2) NOT NULL,
    creditos_excedentes DECIMAL(15, 2) NOT NULL DEFAULT 0,
    valor_base_plano DECIMAL(10, 2) NOT NULL,
    valor_excedentes DECIMAL(10, 2) NOT NULL DEFAULT 0,
    valor_total_brl DECIMAL(10, 2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'emitida', 'paga', 'cancelada')),
    data_emissao TIMESTAMP NULL,
    data_vencimento TIMESTAMP NULL,
    data_pagamento TIMESTAMP NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (client_id) REFERENCES clients(id)
);

CREATE INDEX idx_faturas_client_id ON faturas(client_id);
CREATE INDEX idx_faturas_mes ON faturas(mes_referencia);
CREATE INDEX idx_faturas_status ON faturas(status);

-- ======================================
-- FUNCTIONS / STORED PROCEDURES
-- ======================================

-- Function: Adicionar Usuário ao Cliente
CREATE FUNCTION sp_add_user_to_client(
    p_user_id UUID,
    p_client_id UUID,
    p_papel VARCHAR(20),
    p_cargo VARCHAR(255) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    UPDATE users
    SET
        client_id = p_client_id,
        tipo = 'customer',
        papel = p_papel,
        cargo = p_cargo,
        atualizado_em = NOW()
    WHERE id = p_user_id;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Consumir Créditos
CREATE FUNCTION sp_consume_credits(
    p_client_id UUID,
    p_execution_id UUID,
    p_creditos_a_consumir DECIMAL(15, 2),
    p_descricao_consumo TEXT DEFAULT NULL
) RETURNS DECIMAL(15, 2) AS $$
DECLARE
    v_saldo_atual DECIMAL(15, 2);
    v_novo_saldo DECIMAL(15, 2);
BEGIN
    BEGIN;

    -- Verificar saldo
    SELECT creditos_saldo INTO v_saldo_atual
    FROM client_credits
    WHERE client_id = p_client_id;

    IF v_saldo_atual IS NULL OR v_saldo_atual < p_creditos_a_consumir THEN
        ROLLBACK;
        RAISE EXCEPTION 'Saldo de créditos insuficiente';
    END IF;

    -- Calcular novo saldo
    v_novo_saldo := v_saldo_atual - p_creditos_a_consumir;

    -- Registrar consumo
    INSERT INTO credit_transactions
        (client_id, execution_id, tipo, creditos_alterados,
         saldo_anterior, saldo_novo, descricao)
    VALUES
        (p_client_id, p_execution_id, 'consumption', -p_creditos_a_consumir,
         v_saldo_atual, v_novo_saldo, p_descricao_consumo);

    -- Atualizar saldo
    UPDATE client_credits
    SET
        creditos_saldo = creditos_saldo - p_creditos_a_consumir,
        creditos_consumidos_mes = creditos_consumidos_mes + p_creditos_a_consumir,
        atualizado_em = NOW()
    WHERE client_id = p_client_id;

    -- Atualizar execution com créditos utilizados
    UPDATE executions
    SET creditos_utilizados = p_creditos_a_consumir
    WHERE id = p_execution_id;

    COMMIT;

    RETURN v_novo_saldo;
EXCEPTION WHEN OTHERS THEN
    ROLLBACK;
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Function: Renovar Créditos Mensais
CREATE FUNCTION sp_renew_monthly_credits(p_client_id UUID) RETURNS VOID AS $$
DECLARE
    v_plan_id UUID;
    v_creditos_inclusos DECIMAL(15, 2);
BEGIN
    SELECT cc.plan_id, p.creditos_inclusos
    INTO v_plan_id, v_creditos_inclusos
    FROM client_credits cc
    JOIN credit_plans p ON cc.plan_id = p.id
    WHERE cc.client_id = p_client_id AND cc.ativo = true;

    IF v_plan_id IS NOT NULL THEN
        UPDATE client_credits
        SET
            creditos_saldo = v_creditos_inclusos,
            creditos_consumidos_mes = 0,
            data_renovacao_creditos = NOW() + INTERVAL '1 month',
            atualizado_em = NOW()
        WHERE client_id = p_client_id;

        -- Registrar transação de renovação
        INSERT INTO credit_transactions
            (client_id, tipo, creditos_alterados, saldo_anterior,
             saldo_novo, descricao)
        VALUES
            (p_client_id, 'renewal', v_creditos_inclusos, 0, v_creditos_inclusos,
             'Renovação mensal de créditos do plano');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function: Gerar Fatura Mensal
CREATE FUNCTION sp_generate_monthly_invoice(
    p_client_id UUID,
    p_mes_referencia VARCHAR(7)
) RETURNS TABLE (numero_nf VARCHAR, valor_total DECIMAL) AS $$
DECLARE
    v_creditos_consumidos DECIMAL(15, 2);
    v_creditos_inclusos DECIMAL(15, 2);
    v_valor_unitario DECIMAL(10, 4);
    v_valor_base_extra DECIMAL(10, 2);
    v_valor_plano DECIMAL(10, 2);
    v_creditos_excedentes DECIMAL(15, 2);
    v_valor_total DECIMAL(10, 2);
    v_numero_nf VARCHAR(50);
BEGIN
    -- Obter dados de consumo
    SELECT
        COALESCE(SUM(e.creditos_utilizados), 0),
        p.creditos_inclusos,
        p.valor_mensal_brl,
        p.valor_credito_excedente_brl
    INTO v_creditos_consumidos, v_creditos_inclusos, v_valor_plano, v_valor_unitario
    FROM executions e
    LEFT JOIN client_credits cc ON e.client_id = cc.client_id
    LEFT JOIN credit_plans p ON cc.plan_id = p.id
    WHERE e.client_id = p_client_id
        AND DATE_TRUNC('month', e.finalizado_em) = (p_mes_referencia || '-01')::date::timestamp
    GROUP BY p.creditos_inclusos, p.valor_mensal_brl, p.valor_credito_excedente_brl;

    -- Calcular excedentes
    v_creditos_excedentes := GREATEST(v_creditos_consumidos - v_creditos_inclusos, 0);
    v_valor_base_extra := v_creditos_excedentes * v_valor_unitario;
    v_valor_total := v_valor_plano + v_valor_base_extra;

    -- Gerar número NF
    v_numero_nf := p_mes_referencia || '-' || REPLACE(p_client_id::text, '-', '') || '-' ||
                   TO_CHAR((p_mes_referencia || '-01')::date + INTERVAL '1 month - 1 day', 'yyyymmdd');

    -- Inserir fatura
    INSERT INTO faturas
        (client_id, numero_nf, mes_referencia, creditos_consumidos,
         creditos_inclusos_plano, creditos_excedentes, valor_base_plano,
         valor_excedentes, valor_total_brl, status)
    VALUES
        (p_client_id, v_numero_nf, p_mes_referencia, v_creditos_consumidos,
         v_creditos_inclusos, v_creditos_excedentes, v_valor_plano,
         v_valor_base_extra, v_valor_total, 'draft');

    RETURN QUERY SELECT v_numero_nf, v_valor_total;
END;
$$ LANGUAGE plpgsql;

-- Function: Criar Convite de Usuário
CREATE FUNCTION sp_create_user_invite(
    p_client_id UUID,
    p_email VARCHAR(255),
    p_papel VARCHAR(20),
    p_criado_por UUID
) RETURNS TABLE (token VARCHAR, expires_at TIMESTAMP) AS $$
DECLARE
    v_token VARCHAR(255);
    v_expires_in TIMESTAMP;
BEGIN
    -- Gerar token aleatório (64 caracteres hexadecimais)
    v_token := encode(gen_random_bytes(32), 'hex');
    v_expires_in := NOW() + INTERVAL '7 days';

    INSERT INTO user_invites
        (client_id, email, papel, token, status, criado_por, expira_em)
    VALUES
        (p_client_id, p_email, p_papel, v_token, 'pending', p_criado_por, v_expires_in);

    RETURN QUERY SELECT v_token::VARCHAR, v_expires_in;
END;
$$ LANGUAGE plpgsql;
