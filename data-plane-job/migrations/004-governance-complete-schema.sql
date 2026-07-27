-- ============================================================================
-- Complete Governance Schema - All Dashboards (Overview, Security, Sites, Storage, Sharing, Permissions)
-- ============================================================================

-- ==========================
-- SITES ANALYSIS TABLES
-- ==========================

-- Site health scores and compliance metrics
CREATE TABLE sites_analysis (
    id BIGSERIAL NOT NULL,
    site_id VARCHAR(128) NOT NULL,
    site_name VARCHAR(256) NOT NULL,
    site_url VARCHAR(512) NOT NULL,
    site_owner VARCHAR(256) NULL,
    owner_email VARCHAR(256) NULL,
    health_score INTEGER DEFAULT 50,
    compliance_rate INTEGER DEFAULT 50,
    total_users INTEGER DEFAULT 0,
    total_storage_gb DECIMAL(18,2) DEFAULT 0,
    stale_files_count INTEGER DEFAULT 0,
    external_shares INTEGER DEFAULT 0,
    inactive_users INTEGER DEFAULT 0,
    security_findings INTEGER DEFAULT 0,
    last_scan TIMESTAMP DEFAULT NOW(),
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (site_id),
    UNIQUE (site_url)
);
CREATE INDEX ix_sites_health ON sites_analysis (health_score DESC);
CREATE INDEX ix_sites_owner ON sites_analysis (site_owner);

-- ==========================
-- SECURITY FINDINGS TABLE
-- ==========================

CREATE TABLE security_findings (
    id BIGSERIAL NOT NULL,
    finding_id VARCHAR(128) NOT NULL UNIQUE,
    category VARCHAR(64) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    title VARCHAR(256) NOT NULL,
    description TEXT NULL,
    site_id VARCHAR(128) NULL,
    site_name VARCHAR(256) NULL,
    affected_count INTEGER DEFAULT 0,
    remediation TEXT NULL,
    status VARCHAR(32) DEFAULT 'open',
    data_criacao TIMESTAMP DEFAULT NOW() NOT NULL,
    data_resolucao TIMESTAMP NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_findings_category ON security_findings (category);
CREATE INDEX ix_findings_severity ON security_findings (severity);
CREATE INDEX ix_findings_status ON security_findings (status);

-- ==========================
-- SHARING ANALYSIS TABLE
-- ==========================

CREATE TABLE sharing_analysis (
    id BIGSERIAL NOT NULL,
    share_id VARCHAR(256) NOT NULL UNIQUE,
    file_id VARCHAR(256) NULL,
    file_name VARCHAR(512) NULL,
    site_id VARCHAR(128) NULL,
    site_name VARCHAR(256) NULL,
    share_type VARCHAR(64) NOT NULL,
    shared_with VARCHAR(512) NULL,
    shared_by VARCHAR(256) NULL,
    share_date TIMESTAMP NULL,
    expiration_date TIMESTAMP NULL,
    permissions VARCHAR(64) NULL,
    is_risky BOOLEAN DEFAULT FALSE,
    risk_reason VARCHAR(256) NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_sharing_type ON sharing_analysis (share_type);
CREATE INDEX ix_sharing_risky ON sharing_analysis (is_risky);

-- ==========================
-- USER PERMISSIONS TABLE
-- ==========================

CREATE TABLE user_permissions (
    id BIGSERIAL NOT NULL,
    user_id VARCHAR(256) NOT NULL,
    user_email VARCHAR(256) NOT NULL,
    user_name VARCHAR(256) NULL,
    site_id VARCHAR(128) NOT NULL,
    site_name VARCHAR(256) NULL,
    permission_level VARCHAR(64) NOT NULL,
    is_site_owner BOOLEAN DEFAULT FALSE,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    last_activity TIMESTAMP NULL,
    inactive_days INTEGER DEFAULT 0,
    is_inactive BOOLEAN DEFAULT FALSE,
    is_external BOOLEAN DEFAULT FALSE,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id, site_id)
);
CREATE INDEX ix_permissions_user ON user_permissions (user_email);
CREATE INDEX ix_permissions_mfa ON user_permissions (mfa_enabled);
CREATE INDEX ix_permissions_inactive ON user_permissions (is_inactive);

-- ==========================
-- COMPLIANCE FRAMEWORK TABLE
-- ==========================

CREATE TABLE compliance_framework (
    id INTEGER NOT NULL,
    framework_name VARCHAR(64) NOT NULL,
    control_name VARCHAR(256) NOT NULL,
    requirement TEXT NULL,
    is_compliant BOOLEAN DEFAULT FALSE,
    evidence TEXT NULL,
    remediation TEXT NULL,
    last_assessed TIMESTAMP NULL,
    PRIMARY KEY (id)
);

-- ==========================
-- GOVERNANCE DASHBOARD AGGREGATES
-- ==========================

CREATE TABLE agg_governance_summary (
    metric_date DATE NOT NULL,
    total_sites INTEGER DEFAULT 0,
    healthy_sites INTEGER DEFAULT 0,
    warning_sites INTEGER DEFAULT 0,
    critical_sites INTEGER DEFAULT 0,
    avg_health_score INTEGER DEFAULT 0,
    total_users INTEGER DEFAULT 0,
    mfa_enabled_count INTEGER DEFAULT 0,
    total_external_shares INTEGER DEFAULT 0,
    public_shares INTEGER DEFAULT 0,
    security_findings_count INTEGER DEFAULT 0,
    compliance_rate INTEGER DEFAULT 50,
    total_storage_gb DECIMAL(18,2) DEFAULT 0,
    stale_files_gb DECIMAL(18,2) DEFAULT 0,
    duplicate_files_gb DECIMAL(18,2) DEFAULT 0,
    trash_items_gb DECIMAL(18,2) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (metric_date)
);

-- ==========================
-- STORED PROCEDURES
-- ==========================

-- Function to refresh all governance aggregates
CREATE OR REPLACE FUNCTION sp_refresh_complet_governance_aggregates()
RETURNS void AS $$
DECLARE
    v_metric_date DATE;
BEGIN
    v_metric_date := CAST(NOW() AS DATE);

    -- Delete existing record for today
    DELETE FROM agg_governance_summary WHERE metric_date = v_metric_date;

    -- Calculate and insert summary metrics
    INSERT INTO agg_governance_summary (
        metric_date,
        total_sites,
        healthy_sites,
        warning_sites,
        critical_sites,
        avg_health_score,
        total_users,
        mfa_enabled_count,
        total_external_shares,
        public_shares,
        security_findings_count,
        compliance_rate,
        total_storage_gb,
        stale_files_gb,
        duplicate_files_gb,
        trash_items_gb
    )
    SELECT
        v_metric_date,
        -- Total sites
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis),
        -- Healthy sites (score >= 80)
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score >= 80),
        -- Warning sites (score 60-79)
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score >= 60 AND health_score < 80),
        -- Critical sites (score < 60)
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score < 60),
        -- Average health score
        COALESCE((SELECT AVG(CAST(health_score AS INTEGER)) FROM sites_analysis), 50),
        -- Total unique users
        (SELECT COUNT(DISTINCT user_email) FROM user_permissions),
        -- MFA enabled count
        (SELECT COUNT(DISTINCT user_email) FROM user_permissions WHERE mfa_enabled = TRUE),
        -- External shares
        (SELECT COUNT(*) FROM sharing_analysis WHERE share_type IN ('external_user', 'guest')),
        -- Public shares
        (SELECT COUNT(*) FROM sharing_analysis WHERE share_type = 'public_anyone'),
        -- Security findings (open)
        (SELECT COUNT(*) FROM security_findings WHERE status = 'open'),
        -- Compliance rate (placeholder)
        75,
        -- Total storage
        COALESCE((SELECT SUM(CAST(total_storage_gb AS DECIMAL(18,2))) FROM sites_analysis), 0),
        -- Stale files
        COALESCE((SELECT SUM(CAST(total_size_gb AS DECIMAL(18,2))) FROM agg_stale_files), 0),
        -- Duplicate files
        COALESCE((SELECT SUM(CAST(total_size_gb AS DECIMAL(18,2))) FROM agg_duplicate_files), 0),
        -- Trash items
        COALESCE((SELECT SUM(CAST(total_size_gb AS DECIMAL(18,2))) FROM agg_trash_summary), 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get complete governance overview
CREATE OR REPLACE FUNCTION sp_get_governance_overview()
RETURNS TABLE(total_sites BIGINT, avg_health_score NUMERIC, healthy_sites BIGINT, warning_sites BIGINT, critical_sites BIGINT, open_findings BIGINT, mfa_enabled_users BIGINT, mfa_disabled_users BIGINT, risky_shares BIGINT, total_storage_gb DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis),
        (SELECT AVG(CAST(health_score AS NUMERIC)) FROM sites_analysis),
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score >= 80),
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score >= 60 AND health_score < 80),
        (SELECT COUNT(DISTINCT site_id) FROM sites_analysis WHERE health_score < 60),
        (SELECT COUNT(*) FROM security_findings WHERE status = 'open'),
        (SELECT COUNT(DISTINCT user_email) FROM user_permissions WHERE mfa_enabled = TRUE),
        (SELECT COUNT(DISTINCT user_email) FROM user_permissions WHERE mfa_enabled = FALSE),
        (SELECT COUNT(*) FROM sharing_analysis WHERE is_risky = TRUE),
        COALESCE((SELECT SUM(CAST(total_storage_gb AS DECIMAL(18,2))) FROM sites_analysis), 0);
END;
$$ LANGUAGE plpgsql;

-- Function to get sites health distribution
CREATE OR REPLACE FUNCTION sp_get_sites_health_distribution()
RETURNS TABLE(site_id VARCHAR, site_name VARCHAR, site_owner VARCHAR, owner_email VARCHAR, health_score INTEGER, compliance_rate INTEGER, total_users INTEGER, total_storage_gb DECIMAL, external_shares INTEGER, security_findings INTEGER) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.site_id,
        sa.site_name,
        sa.site_owner,
        sa.owner_email,
        sa.health_score,
        sa.compliance_rate,
        sa.total_users,
        sa.total_storage_gb,
        sa.external_shares,
        sa.security_findings
    FROM sites_analysis sa
    ORDER BY sa.health_score DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get security findings summary
CREATE OR REPLACE FUNCTION sp_get_security_findings_summary(status_param VARCHAR DEFAULT 'open')
RETURNS TABLE(category VARCHAR, count BIGINT, top_severity VARCHAR, total_affected BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sf.category,
        COUNT(*) as count,
        MIN(sf.severity) as top_severity,
        SUM(sf.affected_count) as total_affected
    FROM security_findings sf
    WHERE sf.status = status_param
    GROUP BY sf.category
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get sharing analysis by type
CREATE OR REPLACE FUNCTION sp_get_sharing_analysis_by_type()
RETURNS TABLE(share_type VARCHAR, count BIGINT, risky_count BIGINT, unique_recipients BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sa.share_type,
        COUNT(*) as count,
        SUM(CASE WHEN sa.is_risky = TRUE THEN 1 ELSE 0 END) as risky_count,
        COUNT(DISTINCT sa.shared_with) as unique_recipients
    FROM sharing_analysis sa
    GROUP BY sa.share_type
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user permission risks
CREATE OR REPLACE FUNCTION sp_get_user_permission_risks()
RETURNS TABLE(user_email VARCHAR, user_name VARCHAR, sites_with_access BIGINT, owned_sites BIGINT, sites_without_mfa BIGINT, inactive_sites BIGINT, last_activity TIMESTAMP, owner_count BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        up.user_email,
        up.user_name,
        COUNT(DISTINCT up.site_id) as sites_with_access,
        SUM(CASE WHEN up.is_site_owner = TRUE THEN 1 ELSE 0 END) as owned_sites,
        SUM(CASE WHEN up.mfa_enabled = FALSE THEN 1 ELSE 0 END) as sites_without_mfa,
        SUM(CASE WHEN up.is_inactive = TRUE THEN 1 ELSE 0 END) as inactive_sites,
        MAX(up.last_activity) as last_activity,
        SUM(CASE WHEN up.permission_level = 'owner' THEN 1 ELSE 0 END) as owner_count
    FROM user_permissions up
    GROUP BY up.user_email, up.user_name
    ORDER BY owner_count DESC;
END;
$$ LANGUAGE plpgsql;
