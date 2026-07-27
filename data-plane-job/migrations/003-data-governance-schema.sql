-- ============================================================================
-- Data Governance Schema - Files & Trash Analysis
-- Tenant-isolated tables for SharePoint file metadata and trash tracking
-- ============================================================================

-- ==========================
-- 1. FILES METADATA TABLE
-- ==========================
CREATE TABLE data_files (
    id BIGSERIAL NOT NULL,
    file_id VARCHAR(128) NULL,
    file_name VARCHAR(512) NOT NULL,
    file_size BIGINT NULL,
    total_file_size BIGINT NULL,
    versions_count INTEGER NULL,
    file_type VARCHAR(32) NULL,
    file_hash VARCHAR(256) NULL,
    file_compliance_tag VARCHAR(256) NULL,
    file_sec_classification VARCHAR(128) NULL,
    file_url TEXT NULL,
    site_name VARCHAR(256) NULL,
    site_url VARCHAR(512) NULL,
    relative_url TEXT NULL,
    owner_name VARCHAR(256) NULL,
    owner_mail VARCHAR(256) NULL,
    created_date TIMESTAMP NULL,
    last_modified_user VARCHAR(256) NULL,
    last_modified_mail VARCHAR(256) NULL,
    last_modified_date TIMESTAMP NULL,
    is_subsite BOOLEAN DEFAULT FALSE,
    preservation_hold_library BOOLEAN DEFAULT FALSE,
    years_without_changes DECIMAL(8,2) NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_files_site_url ON data_files (site_url);
CREATE INDEX ix_files_type ON data_files (file_type);
CREATE INDEX ix_files_stale ON data_files (years_without_changes DESC);
CREATE INDEX ix_files_modified ON data_files (last_modified_date DESC);

-- ==========================
-- 2. TRASH ITEMS TABLE
-- ==========================
CREATE TABLE trash_items (
    id BIGSERIAL NOT NULL,
    site_id VARCHAR(128) NULL,
    site_title VARCHAR(256) NULL,
    item_id VARCHAR(128) NULL,
    item_title VARCHAR(512) NULL,
    item_type VARCHAR(64) NULL,
    deleted_by VARCHAR(256) NULL,
    deleted_date TIMESTAMP NULL,
    original_location TEXT NULL,
    size_bytes BIGINT NULL,
    item_state VARCHAR(32) NULL,
    coletado_em TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id)
);
CREATE INDEX ix_trash_site ON trash_items (site_id);
CREATE INDEX ix_trash_deleted_date ON trash_items (deleted_date DESC);

-- ==========================
-- 3. GOVERNANCE RECOMMENDATIONS
-- ==========================
CREATE TABLE governance_recommendations (
    id VARCHAR(64) NOT NULL,
    tipo VARCHAR(64) NOT NULL,
    severidade VARCHAR(32) NOT NULL,
    titulo VARCHAR(256) NOT NULL,
    descricao TEXT NULL,
    economia_potencial_gb DECIMAL(18,2) NULL,
    arquivo_ids TEXT NULL,
    site_url VARCHAR(512) NULL,
    data_criacao TIMESTAMP DEFAULT NOW() NOT NULL,
    resolvido BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (id)
);
CREATE INDEX ix_gov_rec_tipo ON governance_recommendations (tipo);
CREATE INDEX ix_gov_rec_severidade ON governance_recommendations (severidade);

-- ==========================
-- 4. FILE TYPE STATISTICS
-- ==========================
CREATE TABLE agg_file_types (
    file_type VARCHAR(32) NOT NULL,
    total_count BIGINT DEFAULT 0,
    total_size_gb DECIMAL(18,2) DEFAULT 0,
    avg_age_days DECIMAL(10,2) DEFAULT 0,
    stale_count BIGINT DEFAULT 0,
    PRIMARY KEY (file_type)
);

-- ==========================
-- 5. STALE FILES ANALYSIS (pre-aggregated)
-- ==========================
CREATE TABLE agg_stale_files (
    site_url VARCHAR(512) NOT NULL,
    years_without_changes DECIMAL(8,2) NOT NULL,
    file_count BIGINT DEFAULT 0,
    total_size_gb DECIMAL(18,2) DEFAULT 0,
    PRIMARY KEY (site_url, years_without_changes)
);

-- ==========================
-- 6. DUPLICATE FILE CANDIDATES
-- ==========================
CREATE TABLE agg_duplicate_files (
    file_hash VARCHAR(256) NOT NULL,
    file_name VARCHAR(512) NOT NULL,
    occurrence_count INTEGER DEFAULT 0,
    total_size_gb DECIMAL(18,2) DEFAULT 0,
    sites_affected INTEGER DEFAULT 0,
    PRIMARY KEY (file_hash)
);

-- ==========================
-- 7. TRASH SUMMARY
-- ==========================
CREATE TABLE agg_trash_summary (
    site_url VARCHAR(512) NOT NULL,
    total_items BIGINT DEFAULT 0,
    total_size_gb DECIMAL(18,2) DEFAULT 0,
    avg_retention_days INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (site_url)
);

-- ==========================
-- 8. STORED PROCEDURES
-- ==========================

-- Function to refresh governance aggregations
CREATE OR REPLACE FUNCTION sp_refresh_governance_aggregates()
RETURNS void AS $$
BEGIN
    -- File types aggregation
    DELETE FROM agg_file_types;
    INSERT INTO agg_file_types (file_type, total_count, total_size_gb, avg_age_days, stale_count)
    SELECT
        file_type,
        COUNT(*) as total_count,
        SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as total_size_gb,
        AVG(EXTRACT(DAY FROM (NOW() - last_modified_date)))::DECIMAL(10,2) as avg_age_days,
        SUM(CASE WHEN years_without_changes > 1 THEN 1 ELSE 0 END) as stale_count
    FROM data_files
    WHERE file_type IS NOT NULL
    GROUP BY file_type;

    -- Stale files aggregation
    DELETE FROM agg_stale_files;
    INSERT INTO agg_stale_files (site_url, years_without_changes, file_count, total_size_gb)
    SELECT
        site_url,
        CEIL(years_without_changes)::DECIMAL(8,2),
        COUNT(*) as file_count,
        SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as total_size_gb
    FROM data_files
    WHERE years_without_changes > 1
    GROUP BY site_url, CEIL(years_without_changes);

    -- Duplicate candidates aggregation
    DELETE FROM agg_duplicate_files;
    INSERT INTO agg_duplicate_files (file_hash, file_name, occurrence_count, total_size_gb, sites_affected)
    SELECT
        file_hash,
        file_name,
        COUNT(*) as occurrence_count,
        SUM(CAST(file_size AS BIGINT)) / 1073741824.0 as total_size_gb,
        COUNT(DISTINCT site_url) as sites_affected
    FROM data_files
    WHERE file_hash IS NOT NULL
    GROUP BY file_hash, file_name
    HAVING COUNT(*) > 1;

    -- Trash summary aggregation
    DELETE FROM agg_trash_summary;
    INSERT INTO agg_trash_summary (site_url, total_items, total_size_gb, avg_retention_days)
    SELECT
        COALESCE(site_url, site_title),
        COUNT(*) as total_items,
        SUM(CAST(size_bytes AS BIGINT)) / 1073741824.0 as total_size_gb,
        AVG(EXTRACT(DAY FROM (NOW() - deleted_date)))::INTEGER as avg_retention_days
    FROM trash_items
    GROUP BY site_url, site_title;
END;
$$ LANGUAGE plpgsql;

-- Function to get stale files by site with priority
CREATE OR REPLACE FUNCTION sp_get_staled_files_by_site(min_years_without_changes INTEGER DEFAULT 1)
RETURNS TABLE(site_url VARCHAR, file_name VARCHAR, owner_mail VARCHAR, years_without_changes DECIMAL, file_size BIGINT, last_modified_date TIMESTAMP, priority VARCHAR, stale_count_in_site BIGINT) AS $$
BEGIN
    RETURN QUERY
    SELECT
        d.site_url,
        d.file_name,
        d.owner_mail,
        d.years_without_changes,
        d.file_size,
        d.last_modified_date,
        CASE
            WHEN d.years_without_changes > 3 THEN 'Critical'::VARCHAR
            WHEN d.years_without_changes > 2 THEN 'High'::VARCHAR
            ELSE 'Medium'::VARCHAR
        END as priority,
        (SELECT COUNT(*) FROM data_files d2
         WHERE d2.site_url = d.site_url
         AND d2.years_without_changes > min_years_without_changes) as stale_count_in_site
    FROM data_files d
    WHERE d.years_without_changes > min_years_without_changes
    ORDER BY d.years_without_changes DESC, d.file_size DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Function to get duplicate file candidates
CREATE OR REPLACE FUNCTION sp_get_duplicate_candidates(min_occurrences INTEGER DEFAULT 2)
RETURNS TABLE(file_hash VARCHAR, file_name VARCHAR, occurrence_count INTEGER, total_size_gb DECIMAL, sites_affected INTEGER, potential_savings_gb DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT
        adf.file_hash,
        adf.file_name,
        adf.occurrence_count,
        adf.total_size_gb,
        adf.sites_affected,
        (adf.total_size_gb * 0.8) as potential_savings_gb
    FROM agg_duplicate_files adf
    WHERE adf.occurrence_count >= min_occurrences
    ORDER BY adf.total_size_gb DESC
    LIMIT 100;
END;
$$ LANGUAGE plpgsql;

-- Function to get trash items by site
CREATE OR REPLACE FUNCTION sp_get_trash_items_by_site(site_url_param VARCHAR DEFAULT NULL)
RETURNS TABLE(site_title VARCHAR, item_count BIGINT, size_gb DECIMAL, oldest_item TIMESTAMP, newest_item TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.site_title,
        COUNT(*) as item_count,
        SUM(CAST(t.size_bytes AS BIGINT)) / 1073741824.0 as size_gb,
        MIN(t.deleted_date) as oldest_item,
        MAX(t.deleted_date) as newest_item
    FROM trash_items t
    WHERE site_url_param IS NULL OR t.site_url LIKE site_url_param
    GROUP BY t.site_title
    ORDER BY size_gb DESC;
END;
$$ LANGUAGE plpgsql;
