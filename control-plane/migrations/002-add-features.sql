-- ======================================
-- MIGRATIONS: Histórico, Email, PDF, Customização
-- ======================================

-- ======================================
-- 01. EXECUTION SNAPSHOTS - Versionamento de Execuções
-- ======================================
CREATE TABLE execution_snapshots (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    version_number INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
    UNIQUE (execution_id, version_number)
);

CREATE INDEX idx_execution_snapshots_execution_id ON execution_snapshots(execution_id);
CREATE INDEX idx_execution_snapshots_version ON execution_snapshots(execution_id, version_number);

-- ======================================
-- 02. EMAIL QUEUE - Fila de Emails
-- ======================================
CREATE TABLE email_queue (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    recipient_email VARCHAR(255) NOT NULL,
    assunto VARCHAR(255) NOT NULL,
    corpo_html TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    tentativas INTEGER DEFAULT 0,
    max_tentativas INTEGER DEFAULT 5,
    mensagem_erro TEXT NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    enviado_em TIMESTAMP NULL,
    proxima_tentativa_em TIMESTAMP NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_execution_id ON email_queue(execution_id);
CREATE INDEX idx_email_queue_criado_em ON email_queue(criado_em);

-- ======================================
-- 03. PDF STORAGE - Cache de PDFs Gerados
-- ======================================
CREATE TABLE pdf_reports (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    execution_id UUID NOT NULL,
    blob_url TEXT NOT NULL,
    blob_sas_token TEXT NULL,
    tamanho_bytes BIGINT NULL,
    hash_md5 VARCHAR(32) NULL,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    expira_em TIMESTAMP NULL,
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE,
    UNIQUE (execution_id)
);

CREATE INDEX idx_pdf_reports_execution_id ON pdf_reports(execution_id);
CREATE INDEX idx_pdf_reports_criado_em ON pdf_reports(criado_em);

-- ======================================
-- 04. EXECUTION TEMPLATES - Templates de Customização
-- ======================================
CREATE TABLE execution_templates (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    template_nome VARCHAR(255) NOT NULL,
    descricao TEXT NULL,
    config_json JSONB NOT NULL,
    criado_por UUID NOT NULL,
    ativo BOOLEAN NOT NULL DEFAULT true,
    criado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY (criado_por) REFERENCES users(id),
    UNIQUE (tenant_id, template_nome)
);

CREATE INDEX idx_execution_templates_tenant_id ON execution_templates(tenant_id);
CREATE INDEX idx_execution_templates_ativo ON execution_templates(ativo);

-- ======================================
-- 05. ADICIONAR COLUNAS À EXECUTIONS
-- ======================================
ALTER TABLE executions
ADD version_number INTEGER NULL;

ALTER TABLE executions
ADD config_json JSONB NULL;

ALTER TABLE executions
ADD execution_template_id UUID NULL;

ALTER TABLE executions
ADD findings_json JSONB NULL;

ALTER TABLE executions
ADD sites_analisados JSONB NULL;

ALTER TABLE executions
ADD gb_processado DECIMAL(10, 2) NULL;

ALTER TABLE executions
ADD CONSTRAINT fk_executions_template
FOREIGN KEY (execution_template_id) REFERENCES execution_templates(id);

-- ======================================
-- FUNCTIONS / STORED PROCEDURES
-- ======================================

-- Function: Salvar Snapshot de Execução (para histórico)
CREATE FUNCTION sp_save_execution_snapshot(
    p_execution_id UUID,
    p_snapshot_data JSONB
) RETURNS INTEGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    -- Calcular próxima versão
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM execution_snapshots
    WHERE execution_id = p_execution_id;

    INSERT INTO execution_snapshots
        (execution_id, version_number, snapshot_data)
    VALUES
        (p_execution_id, v_version_number, p_snapshot_data);

    -- Atualizar version_number na execution
    UPDATE executions
    SET version_number = v_version_number
    WHERE id = p_execution_id;

    RETURN v_version_number;
END;
$$ LANGUAGE plpgsql;

-- Function: Enfileirar Email
CREATE FUNCTION sp_enqueue_email(
    p_execution_id UUID,
    p_recipient_email VARCHAR(255),
    p_assunto VARCHAR(255),
    p_corpo_html TEXT
) RETURNS UUID AS $$
DECLARE
    v_queue_id UUID;
BEGIN
    v_queue_id := gen_random_uuid();

    INSERT INTO email_queue
        (id, execution_id, recipient_email, assunto, corpo_html, status)
    VALUES
        (v_queue_id, p_execution_id, p_recipient_email, p_assunto, p_corpo_html, 'pending');

    RETURN v_queue_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Registrar PDF Gerado
CREATE FUNCTION sp_register_pdf_report(
    p_execution_id UUID,
    p_blob_url TEXT,
    p_blob_sas_token TEXT,
    p_tamanho_bytes BIGINT,
    p_hash_md5 VARCHAR(32),
    p_expires_at TIMESTAMP
) RETURNS VOID AS $$
BEGIN
    -- Remover PDF anterior se existir
    DELETE FROM pdf_reports
    WHERE execution_id = p_execution_id;

    INSERT INTO pdf_reports
        (execution_id, blob_url, blob_sas_token, tamanho_bytes, hash_md5, expira_em)
    VALUES
        (p_execution_id, p_blob_url, p_blob_sas_token, p_tamanho_bytes, p_hash_md5, p_expires_at);
END;
$$ LANGUAGE plpgsql;

-- Function: Comparar Snapshots (helper para delta)
CREATE FUNCTION sp_compare_snapshots(
    p_execution_id UUID,
    p_version1 INTEGER,
    p_version2 INTEGER
) RETURNS TABLE (
    v1 INTEGER,
    v2 INTEGER,
    data_v1 JSONB,
    data_v2 JSONB,
    created_v1 TIMESTAMP,
    created_v2 TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s1.version_number,
        s2.version_number,
        s1.snapshot_data,
        s2.snapshot_data,
        s1.criado_em,
        s2.criado_em
    FROM execution_snapshots s1
    INNER JOIN execution_snapshots s2
        ON s1.execution_id = s2.execution_id
    WHERE s1.execution_id = p_execution_id
        AND s1.version_number = p_version1
        AND s2.version_number = p_version2;
END;
$$ LANGUAGE plpgsql;
