-- ======================================
-- CONTROL PLANE SCHEMA — Metadados Centrais
-- ======================================
-- Este banco é multi-tenant, mas guarda APENAS metadados.
-- Nenhum dado de SharePoint/OneDrive fica aqui.

-- ======================================
-- 01. CLIENTES
-- ======================================
CREATE TABLE clients (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    razao_social VARCHAR(255) NOT NULL,
    cnpj VARCHAR(14) NOT NULL UNIQUE,
    email_contato VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'terminated')),
    regiao VARCHAR(20) DEFAULT 'brazilsouth',
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    encerrado_em TIMESTAMP NULL
);

CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_cnpj ON clients(cnpj);

-- ======================================
-- 02. TENANTS (M365 de cada cliente)
-- ======================================
CREATE TABLE tenants (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL,
    m365_tenant_id VARCHAR(36) NOT NULL UNIQUE,
    spo_domain VARCHAR(255) NOT NULL,
    app_registration_id UUID NOT NULL,
    key_vault_uri VARCHAR(255) NOT NULL,
    db_connection_string VARCHAR(500) NOT NULL,
    regiao VARCHAR(20) NOT NULL DEFAULT 'brazilsouth',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'provisioning', 'suspended', 'deprovisioning')),
    sso_consentido_em TIMESTAMP NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    encerrado_em TIMESTAMP NULL,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE INDEX idx_tenants_client_id ON tenants(client_id);
CREATE INDEX idx_tenants_status ON tenants(status);
CREATE INDEX idx_tenants_m365_tenant_id ON tenants(m365_tenant_id);

-- ======================================
-- 03. EXECUÇÕES
-- ======================================
CREATE TABLE executions (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    client_id UUID NOT NULL,
    iniciado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    finalizado_em TIMESTAMP NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
    disparado_por UUID NOT NULL,
    container_instance_id VARCHAR(255) NULL,
    mensagem_erro TEXT NULL,
    custo_estimado DECIMAL(10, 2) NULL,
    custo_real DECIMAL(10, 2) NULL,
    tempo_execucao_segundos INTEGER NULL,
    tags_finops JSONB NULL,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (disparado_por) REFERENCES users(id)
);

CREATE INDEX idx_executions_tenant_id ON executions(tenant_id);
CREATE INDEX idx_executions_client_id ON executions(client_id);
CREATE INDEX idx_executions_status ON executions(status);
CREATE INDEX idx_executions_iniciado_em ON executions(iniciado_em);

-- ======================================
-- 04. USUÁRIOS (Painel administrativo)
-- ======================================
CREATE TABLE users (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    entra_object_id UUID NOT NULL UNIQUE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    papel VARCHAR(20) NOT NULL DEFAULT 'viewer'
        CHECK (papel IN ('superadmin', 'analista', 'viewer', 'viewer_cliente')),
    clientes_atribuidos JSONB NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    ultimo_acesso TIMESTAMP NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_papel ON users(papel);

-- ======================================
-- 05. AUDIT LOG (Imutável)
-- ======================================
CREATE TABLE audit_log (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    acao VARCHAR(50) NOT NULL,
    alvo_tipo VARCHAR(30) NOT NULL,
    alvo_id UUID NOT NULL,
    detalhes_json JSONB NULL,
    endereco_ip VARCHAR(45) NULL,
    user_agent TEXT NULL,
    quando TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_alvo_tipo_id ON audit_log(alvo_tipo, alvo_id);
CREATE INDEX idx_audit_log_quando ON audit_log(quando);

-- ======================================
-- 06. JOBS / FILAS (Orquestração)
-- ======================================
CREATE TABLE job_queue (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'assigned', 'running', 'completed', 'failed', 'retrying')),
    tentativas INTEGER DEFAULT 0,
    max_tentativas INTEGER DEFAULT 3,
    prioridade INTEGER DEFAULT 0,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atribuido_em TIMESTAMP NULL,
    completo_em TIMESTAMP NULL,
    proxima_tentativa_em TIMESTAMP NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_prioridade ON job_queue(prioridade DESC, criado_em);

-- ======================================
-- 07. POLICIES (Configurações por Cliente)
-- ======================================
CREATE TABLE policies (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    valor TEXT NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_policies_tenant_id ON policies(tenant_id);

-- ======================================
-- STORED PROCEDURES / FUNCTIONS
-- ======================================

-- Function: Criar novo tenant com onboarding
CREATE FUNCTION sp_create_tenant(
    p_client_id UUID,
    p_m365_tenant_id VARCHAR(36),
    p_spo_domain VARCHAR(255),
    p_app_registration_id UUID,
    p_key_vault_uri VARCHAR(255),
    p_db_connection_string VARCHAR(500),
    p_regiao VARCHAR(20) DEFAULT 'brazilsouth'
) RETURNS UUID AS $$
DECLARE
    v_new_tenant_id UUID;
BEGIN
    v_new_tenant_id := gen_random_uuid();

    INSERT INTO tenants
        (id, client_id, m365_tenant_id, spo_domain, app_registration_id,
         key_vault_uri, db_connection_string, regiao, status)
    VALUES
        (v_new_tenant_id, p_client_id, p_m365_tenant_id, p_spo_domain, p_app_registration_id,
         p_key_vault_uri, p_db_connection_string, p_regiao, 'provisioning');

    RETURN v_new_tenant_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Encerrar tenant (LGPD - direito ao esquecimento)
CREATE FUNCTION sp_terminate_tenant(
    p_tenant_id UUID,
    p_motivo_cancelamento TEXT
) RETURNS VOID AS $$
BEGIN
    UPDATE tenants
    SET status = 'deprovisioning',
        encerrado_em = NOW(),
        atualizado_em = NOW()
    WHERE id = p_tenant_id;
END;
$$ LANGUAGE plpgsql;
