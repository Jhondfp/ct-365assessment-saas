-- ============================================================================
-- Purview Governance Schema - Data Map, DLP, Compliance Posture
-- ============================================================================

-- ==========================
-- DATA MAP - CLASSIFICAÇÃO
-- ==========================

CREATE TABLE purview_data_map (
    id BIGSERIAL NOT NULL,
    scan_id VARCHAR(256) NOT NULL UNIQUE,
    total_scanned_items INTEGER DEFAULT 0,
    classified_items INTEGER DEFAULT 0,
    unclassified_items INTEGER DEFAULT 0,
    classification_coverage INTEGER DEFAULT 0,
    sensitive_items_count INTEGER DEFAULT 0,
    scan_start_date TIMESTAMP NULL,
    scan_end_date TIMESTAMP NULL,
    status VARCHAR(32) DEFAULT 'Completed',
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_datamap_coverage ON purview_data_map (classification_coverage DESC);

-- ==========================
-- SENSITIVE DATA TYPES
-- ==========================

CREATE TABLE purview_sensitive_data_types (
    id BIGSERIAL NOT NULL,
    scan_id VARCHAR(256) NOT NULL,
    data_type_name VARCHAR(256) NOT NULL,
    data_type_category VARCHAR(128) NOT NULL,
    count INTEGER DEFAULT 0,
    severity VARCHAR(32) DEFAULT 'Médio',
    is_sensitive BOOLEAN DEFAULT TRUE,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (scan_id) REFERENCES purview_data_map(scan_id)
);
CREATE INDEX ix_sensitive_type_name ON purview_sensitive_data_types (data_type_name);
CREATE INDEX ix_sensitive_severity ON purview_sensitive_data_types (severity);

-- ==========================
-- SENSITIVE DATA LOCATIONS
-- ==========================

CREATE TABLE purview_data_locations (
    id BIGSERIAL NOT NULL,
    scan_id VARCHAR(256) NOT NULL,
    sensitive_type_id BIGINT NOT NULL,
    location VARCHAR(256) NOT NULL,
    location_url VARCHAR(512) NULL,
    item_count INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (sensitive_type_id) REFERENCES purview_sensitive_data_types(id),
    FOREIGN KEY (scan_id) REFERENCES purview_data_map(scan_id)
);
CREATE INDEX ix_location_name ON purview_data_locations (location);

-- ==========================
-- DLP POLICIES
-- ==========================

CREATE TABLE purview_dlp_policies (
    id BIGSERIAL NOT NULL,
    policy_id VARCHAR(256) NOT NULL UNIQUE,
    policy_name VARCHAR(256) NOT NULL,
    description TEXT NULL,
    status VARCHAR(32) DEFAULT 'Ativada',
    severity VARCHAR(32) DEFAULT 'Alto',
    created_date TIMESTAMP NULL,
    modified_date TIMESTAMP NULL,
    policy_rules_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    last_triggered TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_dlp_status ON purview_dlp_policies (status);
CREATE INDEX ix_dlp_severity ON purview_dlp_policies (severity);

-- ==========================
-- DLP POLICY LOCATIONS
-- ==========================

CREATE TABLE purview_dlp_locations (
    id BIGSERIAL NOT NULL,
    policy_id VARCHAR(256) NOT NULL,
    location VARCHAR(256) NOT NULL,
    is_included BOOLEAN DEFAULT TRUE,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (policy_id) REFERENCES purview_dlp_policies(policy_id)
);

-- ==========================
-- DLP VIOLATIONS
-- ==========================

CREATE TABLE purview_dlp_violations (
    id BIGSERIAL NOT NULL,
    violation_id VARCHAR(256) NOT NULL UNIQUE,
    policy_id VARCHAR(256) NOT NULL,
    policy_name VARCHAR(256) NOT NULL,
    detected_date TIMESTAMP NOT NULL,
    severity VARCHAR(32) DEFAULT 'Médio',
    location VARCHAR(256) NOT NULL,
    user_email VARCHAR(256) NULL,
    action_taken VARCHAR(128) DEFAULT 'Notificado',
    sensitive_info_found VARCHAR(256) NULL,
    item_count INTEGER DEFAULT 1,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_date TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (policy_id) REFERENCES purview_dlp_policies(policy_id)
);
CREATE INDEX ix_violation_date ON purview_dlp_violations (detected_date DESC);
CREATE INDEX ix_violation_severity ON purview_dlp_violations (severity);
CREATE INDEX ix_violation_resolved ON purview_dlp_violations (is_resolved);

-- ==========================
-- COMPLIANCE FRAMEWORKS
-- ==========================

CREATE TABLE purview_compliance_frameworks (
    id BIGSERIAL NOT NULL,
    framework_id VARCHAR(128) NOT NULL UNIQUE,
    framework_name VARCHAR(256) NOT NULL,
    compliance_status VARCHAR(32) DEFAULT 'Não Compliant',
    compliance_score INTEGER DEFAULT 0,
    total_controls INTEGER DEFAULT 0,
    compliant_controls INTEGER DEFAULT 0,
    non_compliant_controls INTEGER DEFAULT 0,
    findings_count INTEGER DEFAULT 0,
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    medium_findings INTEGER DEFAULT 0,
    last_assessment_date TIMESTAMP NULL,
    next_assessment_date TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_framework_status ON purview_compliance_frameworks (compliance_status);
CREATE INDEX ix_framework_score ON purview_compliance_frameworks (compliance_score DESC);

-- ==========================
-- COMPLIANCE POSTURE
-- ==========================

CREATE TABLE purview_compliance_posture (
    id BIGSERIAL NOT NULL,
    posture_date DATE NOT NULL UNIQUE,
    overall_score INTEGER DEFAULT 0,
    data_classification_score INTEGER DEFAULT 0,
    dlp_policies_score INTEGER DEFAULT 0,
    retention_policies_score INTEGER DEFAULT 0,
    compliant_frameworks INTEGER DEFAULT 0,
    partially_compliant_frameworks INTEGER DEFAULT 0,
    non_compliant_frameworks INTEGER DEFAULT 0,
    total_findings INTEGER DEFAULT 0,
    critical_findings INTEGER DEFAULT 0,
    high_findings INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (posture_date)
);

-- ==========================
-- DATA RISK ASSESSMENT
-- ==========================

CREATE TABLE purview_data_risk_assessment (
    id BIGSERIAL NOT NULL,
    assessment_date DATE NOT NULL UNIQUE,
    risk_score INTEGER DEFAULT 0,
    risk_level VARCHAR(32) DEFAULT 'Baixo',
    sensitive_items_count INTEGER DEFAULT 0,
    dlp_violations_count INTEGER DEFAULT 0,
    unclassified_items_count INTEGER DEFAULT 0,
    exposed_locations_count INTEGER DEFAULT 0,
    high_risk_data_types_count INTEGER DEFAULT 0,
    recommendations_count INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (assessment_date)
);

-- ==========================
-- DATA RISK RECOMMENDATIONS
-- ==========================

CREATE TABLE purview_data_risk_recommendations (
    id BIGSERIAL NOT NULL,
    recommendation_id VARCHAR(256) NOT NULL UNIQUE,
    assessment_date DATE NOT NULL,
    recommendation_text TEXT NOT NULL,
    category VARCHAR(64) NOT NULL,
    priority VARCHAR(32) DEFAULT 'Medium',
    estimated_impact VARCHAR(256) NULL,
    remediation_steps TEXT NULL,
    status VARCHAR(32) DEFAULT 'Open',
    created_date TIMESTAMP DEFAULT NOW() NOT NULL,
    resolved_date TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (assessment_date) REFERENCES purview_data_risk_assessment(assessment_date)
);
CREATE INDEX ix_recommendation_priority ON purview_data_risk_recommendations (priority);
CREATE INDEX ix_recommendation_status ON purview_data_risk_recommendations (status);

-- ==========================
-- AGGREGATION TABLES
-- ==========================

CREATE TABLE agg_purview_summary (
    id BIGSERIAL NOT NULL,
    summary_date DATE NOT NULL UNIQUE,
    total_sensitive_items INTEGER DEFAULT 0,
    classification_coverage INTEGER DEFAULT 0,
    active_dlp_policies INTEGER DEFAULT 0,
    dlp_violations_last_7days INTEGER DEFAULT 0,
    dlp_violations_last_30days INTEGER DEFAULT 0,
    compliance_score INTEGER DEFAULT 0,
    compliant_frameworks INTEGER DEFAULT 0,
    data_risk_score INTEGER DEFAULT 0,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (summary_date)
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Function to aggregate Purview summary daily
CREATE OR REPLACE FUNCTION sp_aggregate_purview_summary(summary_date_param DATE DEFAULT NULL)
RETURNS void AS $$
DECLARE
    v_summary_date DATE;
    v_total_sensitive_items INTEGER;
    v_classification_coverage INTEGER;
    v_active_dlp_policies INTEGER;
    v_dlp_violations_7_days INTEGER;
    v_dlp_violations_30_days INTEGER;
    v_compliance_score INTEGER;
    v_compliant_frameworks INTEGER;
    v_data_risk_score INTEGER;
BEGIN
    v_summary_date := COALESCE(summary_date_param, CAST(NOW() AS DATE));

    v_total_sensitive_items := COALESCE((
        SELECT SUM(count)
        FROM purview_sensitive_data_types
        WHERE CAST(coletado_em AS DATE) = v_summary_date
    ), 0);

    v_classification_coverage := COALESCE((
        SELECT classification_coverage
        FROM purview_data_map
        WHERE CAST(coletado_em AS DATE) = v_summary_date
        ORDER BY coletado_em DESC
        LIMIT 1
    ), 0);

    v_active_dlp_policies := (
        SELECT COUNT(*)
        FROM purview_dlp_policies
        WHERE is_active = TRUE AND CAST(coletado_em AS DATE) <= v_summary_date
    );

    v_dlp_violations_7_days := (
        SELECT COUNT(*)
        FROM purview_dlp_violations
        WHERE detected_date >= v_summary_date - INTERVAL '7 days'
            AND detected_date < v_summary_date + INTERVAL '1 day'
    );

    v_dlp_violations_30_days := (
        SELECT COUNT(*)
        FROM purview_dlp_violations
        WHERE detected_date >= v_summary_date - INTERVAL '30 days'
            AND detected_date < v_summary_date + INTERVAL '1 day'
    );

    v_compliance_score := COALESCE((
        SELECT overall_score
        FROM purview_compliance_posture
        WHERE posture_date <= v_summary_date
        ORDER BY posture_date DESC
        LIMIT 1
    ), 0);

    v_compliant_frameworks := (
        SELECT COUNT(*)
        FROM purview_compliance_frameworks
        WHERE compliance_status = 'Compliant'
    );

    v_data_risk_score := COALESCE((
        SELECT risk_score
        FROM purview_data_risk_assessment
        WHERE assessment_date <= v_summary_date
        ORDER BY assessment_date DESC
        LIMIT 1
    ), 0);

    INSERT INTO agg_purview_summary (
        summary_date, total_sensitive_items, classification_coverage,
        active_dlp_policies, dlp_violations_last_7days, dlp_violations_last_30days,
        compliance_score, compliant_frameworks, data_risk_score
    )
    VALUES (
        v_summary_date, v_total_sensitive_items, v_classification_coverage,
        v_active_dlp_policies, v_dlp_violations_7_days, v_dlp_violations_30_days,
        v_compliance_score, v_compliant_frameworks, v_data_risk_score
    );
END;
$$ LANGUAGE plpgsql;

-- Function to update data risk score
CREATE OR REPLACE FUNCTION sp_update_data_risk_assessment(
    assessment_date_param DATE,
    risk_score_param INTEGER,
    sensitive_items_count_param INTEGER,
    dlp_violations_count_param INTEGER,
    unclassified_items_count_param INTEGER,
    exposed_locations_count_param INTEGER
)
RETURNS void AS $$
DECLARE
    v_risk_level VARCHAR(32);
BEGIN
    IF risk_score_param >= 70 THEN
        v_risk_level := 'Crítico';
    ELSIF risk_score_param >= 50 THEN
        v_risk_level := 'Alto';
    ELSIF risk_score_param >= 30 THEN
        v_risk_level := 'Médio';
    ELSE
        v_risk_level := 'Baixo';
    END IF;

    INSERT INTO purview_data_risk_assessment (
        assessment_date, risk_score, risk_level, sensitive_items_count,
        dlp_violations_count, unclassified_items_count, exposed_locations_count
    ) VALUES (
        assessment_date_param, risk_score_param, v_risk_level, sensitive_items_count_param,
        dlp_violations_count_param, unclassified_items_count_param, exposed_locations_count_param
    )
    ON CONFLICT (assessment_date) DO UPDATE SET
        risk_score = risk_score_param,
        risk_level = v_risk_level,
        sensitive_items_count = sensitive_items_count_param,
        dlp_violations_count = dlp_violations_count_param,
        unclassified_items_count = unclassified_items_count_param,
        exposed_locations_count = exposed_locations_count_param;
END;
$$ LANGUAGE plpgsql;
