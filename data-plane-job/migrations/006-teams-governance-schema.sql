-- ============================================================================
-- Teams Governance Schema - Complete Teams, Channels, Members, Activity Analysis
-- ============================================================================

-- ==========================
-- TEAMS ANALYSIS TABLE
-- ==========================

CREATE TABLE teams_analysis (
    id BIGSERIAL NOT NULL,
    team_id VARCHAR(256) NOT NULL UNIQUE,
    display_name VARCHAR(512) NOT NULL,
    description TEXT NULL,
    created_date TIMESTAMP NULL,
    team_owner VARCHAR(256) NULL,
    owner_email VARCHAR(256) NULL,
    is_archived BOOLEAN DEFAULT FALSE,
    is_public BOOLEAN DEFAULT FALSE,
    member_count INTEGER DEFAULT 0,
    guest_count INTEGER DEFAULT 0,
    channel_count INTEGER DEFAULT 0,
    storage_gb DECIMAL(18,2) DEFAULT 0,
    days_old INTEGER DEFAULT 0,
    days_inactive INTEGER DEFAULT 0,
    risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(32) DEFAULT 'Baixo',
    has_retention_policy BOOLEAN DEFAULT FALSE,
    last_activity TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (team_id)
);
CREATE INDEX ix_teams_risk ON teams_analysis (risk_score DESC);
CREATE INDEX ix_teams_owner ON teams_analysis (team_owner);
CREATE INDEX ix_teams_archived ON teams_analysis (is_archived);
CREATE INDEX ix_teams_inactive ON teams_analysis (days_inactive DESC);

-- ==========================
-- TEAMS CHANNELS TABLE
-- ==========================

CREATE TABLE teams_channels (
    id BIGSERIAL NOT NULL,
    channel_id VARCHAR(256) NOT NULL,
    team_id VARCHAR(256) NOT NULL,
    display_name VARCHAR(512) NOT NULL,
    channel_type VARCHAR(64) DEFAULT 'standard',
    description TEXT NULL,
    is_favorite_by_default BOOLEAN DEFAULT FALSE,
    has_messages BOOLEAN DEFAULT FALSE,
    last_message_date TIMESTAMP NULL,
    days_since_last_message INTEGER DEFAULT -1,
    message_count INTEGER DEFAULT 0,
    member_count INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (team_id) REFERENCES teams_analysis(team_id)
);
CREATE INDEX ix_channels_team ON teams_channels (team_id);
CREATE INDEX ix_channels_activity ON teams_channels (last_message_date DESC);

-- ==========================
-- TEAMS MEMBERS TABLE
-- ==========================

CREATE TABLE teams_members (
    id BIGSERIAL NOT NULL,
    member_id VARCHAR(256) NOT NULL,
    team_id VARCHAR(256) NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    email VARCHAR(256) NOT NULL,
    user_principal_name VARCHAR(256) NULL,
    role VARCHAR(64) DEFAULT 'member',
    member_type VARCHAR(32) DEFAULT 'user',
    last_activity TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (team_id) REFERENCES teams_analysis(team_id)
);
CREATE INDEX ix_members_team ON teams_members (team_id);
CREATE INDEX ix_members_email ON teams_members (email);
CREATE INDEX ix_members_role ON teams_members (role);

-- ==========================
-- TEAMS GUESTS TABLE
-- ==========================

CREATE TABLE teams_guests (
    id BIGSERIAL NOT NULL,
    guest_id VARCHAR(256) NOT NULL,
    team_id VARCHAR(256) NOT NULL,
    display_name VARCHAR(256) NOT NULL,
    email VARCHAR(256) NOT NULL,
    guest_domain VARCHAR(256) NULL,
    added_date TIMESTAMP NULL,
    last_activity TIMESTAMP NULL,
    days_as_guest INTEGER DEFAULT 0,
    is_external BOOLEAN DEFAULT TRUE,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (team_id) REFERENCES teams_analysis(team_id)
);
CREATE INDEX ix_guests_team ON teams_guests (team_id);
CREATE INDEX ix_guests_domain ON teams_guests (guest_domain);

-- ==========================
-- TEAMS RECOMMENDATIONS TABLE
-- ==========================

CREATE TABLE teams_recommendations (
    id BIGSERIAL NOT NULL,
    recommendation_id VARCHAR(256) NOT NULL UNIQUE,
    team_id VARCHAR(256) NOT NULL,
    recommendation_type VARCHAR(64) NOT NULL,
    recommendation_text TEXT NOT NULL,
    severity VARCHAR(32) DEFAULT 'medium',
    remediation_steps TEXT NULL,
    status VARCHAR(32) DEFAULT 'open',
    created_date TIMESTAMP DEFAULT NOW() NOT NULL,
    resolved_date TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (team_id) REFERENCES teams_analysis(team_id)
);
CREATE INDEX ix_recs_team ON teams_recommendations (team_id);
CREATE INDEX ix_recs_severity ON teams_recommendations (severity);
CREATE INDEX ix_recs_status ON teams_recommendations (status);

-- ==========================
-- TEAMS STORAGE ANALYSIS TABLE
-- ==========================

CREATE TABLE teams_storage_analysis (
    id BIGSERIAL NOT NULL,
    team_id VARCHAR(256) NOT NULL,
    total_storage_gb DECIMAL(18,2) DEFAULT 0,
    shared_drive_gb DECIMAL(18,2) DEFAULT 0,
    files_count INTEGER DEFAULT 0,
    largest_file_size_mb DECIMAL(18,2) DEFAULT 0,
    oldest_file_date TIMESTAMP NULL,
    stale_files_30days INTEGER DEFAULT 0,
    stale_files_90days INTEGER DEFAULT 0,
    stale_files_180days INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (team_id) REFERENCES teams_analysis(team_id)
);
CREATE INDEX ix_storage_team ON teams_storage_analysis (team_id);

-- ==========================
-- AGGREGATION TABLES
-- ==========================

CREATE TABLE agg_teams_summary (
    id BIGSERIAL NOT NULL,
    summary_date DATE NOT NULL UNIQUE,
    total_teams INTEGER DEFAULT 0,
    teams_archived INTEGER DEFAULT 0,
    teams_orphaned INTEGER DEFAULT 0,
    teams_inactive INTEGER DEFAULT 0,
    teams_public INTEGER DEFAULT 0,
    teams_high_risk INTEGER DEFAULT 0,
    total_members INTEGER DEFAULT 0,
    total_guests INTEGER DEFAULT 0,
    total_channels INTEGER DEFAULT 0,
    total_storage_gb DECIMAL(18,2) DEFAULT 0,
    risk_score_avg DECIMAL(5,2) DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (summary_date)
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Function to aggregate Teams data daily
CREATE OR REPLACE FUNCTION sp_aggregate_teams_summary(summary_date_param DATE DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_summary_date DATE;
BEGIN
    v_summary_date := COALESCE(summary_date_param, CAST(NOW() AS DATE));

    INSERT INTO agg_teams_summary (
        summary_date, total_teams, teams_archived, teams_orphaned,
        teams_inactive, teams_public, teams_high_risk, total_members,
        total_guests, total_channels, total_storage_gb, risk_score_avg
    )
    SELECT
        v_summary_date,
        COUNT(DISTINCT team_id),
        SUM(CASE WHEN is_archived = TRUE THEN 1 ELSE 0 END),
        SUM(CASE WHEN team_owner IS NULL THEN 1 ELSE 0 END),
        SUM(CASE WHEN days_inactive > 180 THEN 1 ELSE 0 END),
        SUM(CASE WHEN is_public = TRUE THEN 1 ELSE 0 END),
        SUM(CASE WHEN risk_score >= 50 THEN 1 ELSE 0 END),
        SUM(member_count),
        SUM(guest_count),
        SUM(channel_count),
        SUM(storage_gb),
        AVG(CAST(risk_score AS DECIMAL(5,2)))
    FROM teams_analysis
    WHERE CAST(coletado_em AS DATE) = v_summary_date;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate Teams risk scores
CREATE OR REPLACE FUNCTION sp_calculate_teams_risk_score(team_id_param VARCHAR(256))
RETURNS void AS $$
DECLARE
    v_risk_score INTEGER := 0;
    v_days_inactive INTEGER;
    v_member_count INTEGER;
    v_guest_count INTEGER;
    v_is_orphaned BOOLEAN;
    v_is_public BOOLEAN;
    v_is_archived BOOLEAN;
BEGIN
    SELECT
        days_inactive,
        member_count,
        guest_count,
        CASE WHEN team_owner IS NULL THEN TRUE ELSE FALSE END,
        is_public,
        is_archived
    INTO v_days_inactive, v_member_count, v_guest_count, v_is_orphaned, v_is_public, v_is_archived
    FROM teams_analysis
    WHERE team_id = team_id_param;

    -- Orphaned team (no owner): 40 points
    IF v_is_orphaned = TRUE THEN v_risk_score := v_risk_score + 40; END IF;

    -- Inactive >180 days: 35 points
    IF v_days_inactive > 180 THEN v_risk_score := v_risk_score + 35; END IF;

    -- Public team: 20 points
    IF v_is_public = TRUE THEN v_risk_score := v_risk_score + 20; END IF;

    -- Many guests (>50): 15 points
    IF v_guest_count > 50 THEN v_risk_score := v_risk_score + 15; END IF;

    -- Mitigating factor: archived team: -50 points
    IF v_is_archived = TRUE THEN v_risk_score := CASE WHEN v_risk_score >= 50 THEN v_risk_score - 50 ELSE 0 END; END IF;

    -- Cap at 100
    v_risk_score := CASE WHEN v_risk_score > 100 THEN 100 ELSE v_risk_score END;

    UPDATE teams_analysis
    SET
        risk_score = v_risk_score,
        risk_level = CASE
            WHEN v_risk_score >= 70 THEN 'Crítico'
            WHEN v_risk_score >= 50 THEN 'Alto'
            WHEN v_risk_score >= 30 THEN 'Médio'
            ELSE 'Baixo'
        END
    WHERE team_id = team_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function to generate Teams recommendations
CREATE OR REPLACE FUNCTION sp_generate_teams_recommendations(team_id_param VARCHAR(256))
RETURNS void AS $$
DECLARE
    v_team_name VARCHAR(512);
    v_days_inactive INTEGER;
    v_guest_count INTEGER;
    v_is_orphaned BOOLEAN;
    v_is_public BOOLEAN;
    v_has_retention BOOLEAN;
BEGIN
    SELECT
        display_name,
        days_inactive,
        guest_count,
        CASE WHEN team_owner IS NULL THEN TRUE ELSE FALSE END,
        is_public,
        has_retention_policy
    INTO v_team_name, v_days_inactive, v_guest_count, v_is_orphaned, v_is_public, v_has_retention
    FROM teams_analysis
    WHERE team_id = team_id_param;

    -- Delete existing recommendations for this team
    DELETE FROM teams_recommendations
    WHERE team_id = team_id_param AND status = 'open';

    -- Orphaned team recommendation
    IF v_is_orphaned = TRUE THEN
        INSERT INTO teams_recommendations (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            gen_random_uuid()::VARCHAR, team_id_param, 'orphaned',
            'Este Time não possui proprietário designado',
            'critical',
            'Acesse configurações do Time > Membros > Designar um proprietário'
        );
    END IF;

    -- Inactive team recommendation
    IF v_days_inactive > 180 THEN
        INSERT INTO teams_recommendations (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            gen_random_uuid()::VARCHAR, team_id_param, 'inactive',
            'Este Time está inativo há mais de 6 meses',
            'high',
            'Considere arquivar o Time se não for mais utilizado > Configurações > Arquivar este Time'
        );
    END IF;

    -- Public team recommendation
    IF v_is_public = TRUE THEN
        INSERT INTO teams_recommendations (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            gen_random_uuid()::VARCHAR, team_id_param, 'public',
            'Este é um Time público - qualquer usuário pode se juntar',
            'high',
            'Verifique dados sensíveis > Configurações > Alterar para Privado se necessário'
        );
    END IF;

    -- Many guests recommendation
    IF v_guest_count > 50 THEN
        INSERT INTO teams_recommendations (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            gen_random_uuid()::VARCHAR, team_id_param, 'many_guests',
            'Este Time possui muitos convidados externos (' || CAST(v_guest_count AS VARCHAR) || ')',
            'medium',
            'Revise o acesso de convidados > Configurações > Membros > Gerenciar convidados'
        );
    END IF;

    -- No retention policy recommendation
    IF v_has_retention = FALSE THEN
        INSERT INTO teams_recommendations (
            recommendation_id, team_id, recommendation_type,
            recommendation_text, severity, remediation_steps
        ) VALUES (
            gen_random_uuid()::VARCHAR, team_id_param, 'no_retention',
            'Nenhuma política de retenção de mensagens configurada',
            'medium',
            'Configure política de retenção > Centro de Conformidade > Políticas de Retenção'
        );
    END IF;
END;
$$ LANGUAGE plpgsql;
