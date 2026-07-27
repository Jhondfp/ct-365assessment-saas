-- ======================================
-- TENANT ISOLATED DATABASE SCHEMA
-- ======================================
-- Este script é executado NO BANCO DO TENANT (não no Control Plane)
-- Deve ser executado uma vez por tenant durante provisioning

-- ======================================
-- 01. SITES (SharePoint Sites)
-- ======================================
CREATE TABLE spo_sites (
    id UUID NOT NULL PRIMARY KEY,
    site_id VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    web_url VARCHAR(2048) NOT NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL,
    last_modified TIMESTAMP NULL,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_spo_sites_web_url ON spo_sites(web_url);

-- ======================================
-- 02. DRIVES (Document Libraries)
-- ======================================
CREATE TABLE spo_drives (
    id UUID NOT NULL PRIMARY KEY,
    site_id UUID NOT NULL,
    drive_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    web_url VARCHAR(2048) NOT NULL,
    total_size_bytes BIGINT NULL,
    file_count INTEGER NULL,
    folder_count INTEGER NULL,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (site_id) REFERENCES spo_sites(id) ON DELETE CASCADE
);

CREATE INDEX idx_spo_drives_site_id ON spo_drives(site_id);

-- ======================================
-- 03. FILES (Documentos)
-- ======================================
CREATE TABLE spo_files (
    id UUID NOT NULL PRIMARY KEY,
    drive_id UUID NOT NULL,
    file_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_extension VARCHAR(10) NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    last_modified TIMESTAMP NULL,
    created_by VARCHAR(255) NULL,
    web_url VARCHAR(2048) NULL,
    is_shared BOOLEAN DEFAULT false,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (drive_id) REFERENCES spo_drives(id) ON DELETE CASCADE
);

CREATE INDEX idx_spo_files_drive_id ON spo_files(drive_id);
CREATE INDEX idx_spo_files_extension ON spo_files(file_extension);
CREATE INDEX idx_spo_files_size ON spo_files(size_bytes);

-- ======================================
-- 04. FOLDERS (Pastas)
-- ======================================
CREATE TABLE spo_folders (
    id UUID NOT NULL PRIMARY KEY,
    drive_id UUID NOT NULL,
    folder_id VARCHAR(255) NOT NULL,
    folder_name VARCHAR(255) NOT NULL,
    item_count INTEGER NULL,
    created_at TIMESTAMP NOT NULL,
    last_modified TIMESTAMP NULL,
    web_url VARCHAR(2048) NULL,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (drive_id) REFERENCES spo_drives(id) ON DELETE CASCADE
);

CREATE INDEX idx_spo_folders_drive_id ON spo_folders(drive_id);

-- ======================================
-- 05. ONEDRIVE (Users Personal Drives)
-- ======================================
CREATE TABLE od_users (
    id UUID NOT NULL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    mail VARCHAR(255) NULL,
    drive_id VARCHAR(255) NOT NULL,
    web_url VARCHAR(2048) NOT NULL,
    quota_used_bytes BIGINT NULL,
    quota_total_bytes BIGINT NULL,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_od_users_mail ON od_users(mail);

-- ======================================
-- 06. ONEDRIVE FILES
-- ======================================
CREATE TABLE od_files (
    id UUID NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL,
    file_id VARCHAR(255) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_extension VARCHAR(10) NULL,
    size_bytes BIGINT NOT NULL,
    created_at TIMESTAMP NOT NULL,
    last_modified TIMESTAMP NULL,
    is_shared BOOLEAN DEFAULT false,
    shared_scope VARCHAR(20) NULL,
    coletado_em TIMESTAMP NOT NULL DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES od_users(id) ON DELETE CASCADE
);

CREATE INDEX idx_od_files_user_id ON od_files(user_id);
CREATE INDEX idx_od_files_extension ON od_files(file_extension);

-- ======================================
-- 07. FINDINGS (Achados / Riscos)
-- ======================================
CREATE TABLE findings (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    finding_type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
    impact TEXT NULL,
    recommendation TEXT NULL,
    affected_count INTEGER NULL,
    affected_resources JSONB NULL,
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'remediated')),
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_findings_severity ON findings(severity);
CREATE INDEX idx_findings_status ON findings(status);

-- ======================================
-- 08. COLLECTION_LOGS (Auditoria)
-- ======================================
CREATE TABLE collection_logs (
    id UUID NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'in_progress', 'completed', 'failed')),
    total_sites INTEGER NULL,
    total_drives INTEGER NULL,
    total_files INTEGER NULL,
    total_users INTEGER NULL,
    total_size_gb DECIMAL(15, 2) NULL,
    total_findings INTEGER NULL,
    error_message TEXT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL,
    duration_seconds INTEGER NULL
);

CREATE INDEX idx_collection_logs_status ON collection_logs(status);
CREATE INDEX idx_collection_logs_started_at ON collection_logs(started_at);

-- ======================================
-- SUMMARY VIEWS
-- ======================================

-- View: SharePoint Summary
CREATE VIEW vw_spo_summary AS
SELECT
    COUNT(DISTINCT s.id) as site_count,
    COUNT(DISTINCT d.id) as drive_count,
    COUNT(DISTINCT f.id) as file_count,
    SUM(f.size_bytes) as total_size_bytes,
    SUM(CASE WHEN f.is_shared THEN 1 ELSE 0 END) as shared_file_count,
    MAX(cl.completed_at) as last_collection_time
FROM spo_sites s
LEFT JOIN spo_drives d ON s.id = d.site_id
LEFT JOIN spo_files f ON d.id = f.drive_id
LEFT JOIN collection_logs cl ON cl.collection_type = 'sharepoint' AND cl.status = 'completed';

-- View: OneDrive Summary
CREATE VIEW vw_od_summary AS
SELECT
    COUNT(DISTINCT u.id) as user_count,
    COUNT(DISTINCT f.id) as file_count,
    SUM(f.size_bytes) as total_size_bytes,
    SUM(u.quota_used_bytes) as total_quota_used,
    SUM(CASE WHEN f.is_shared THEN 1 ELSE 0 END) as shared_file_count,
    MAX(cl.completed_at) as last_collection_time
FROM od_users u
LEFT JOIN od_files f ON u.id = f.user_id
LEFT JOIN collection_logs cl ON cl.collection_type = 'onedrive' AND cl.status = 'completed';

-- View: File Type Distribution
CREATE VIEW vw_file_types AS
SELECT
    COALESCE(spo.file_extension, od.file_extension, 'unknown') as extension,
    COUNT(spo.id) as spo_count,
    COUNT(od.id) as od_count,
    SUM(spo.size_bytes) as spo_size_bytes,
    SUM(od.size_bytes) as od_size_bytes
FROM
    (SELECT file_extension, size_bytes, id FROM spo_files) spo
FULL OUTER JOIN
    (SELECT file_extension, size_bytes, id FROM od_files) od
    ON spo.file_extension = od.file_extension
GROUP BY COALESCE(spo.file_extension, od.file_extension, 'unknown')
ORDER BY (SUM(spo.size_bytes) + SUM(od.size_bytes)) DESC;

-- ======================================
-- FUNCTIONS / STORED PROCEDURES
-- ======================================

-- Function: Insert SharePoint Site
CREATE FUNCTION sp_insert_spo_site(
    p_site_id VARCHAR(255),
    p_display_name VARCHAR(255),
    p_web_url VARCHAR(2048),
    p_description TEXT DEFAULT NULL,
    p_created_at TIMESTAMP DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    v_id := gen_random_uuid();

    INSERT INTO spo_sites
        (id, site_id, display_name, web_url, description, created_at)
    VALUES
        (v_id, p_site_id, p_display_name, p_web_url, p_description,
         COALESCE(p_created_at, NOW()));

    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Insert SharePoint Files (Batch)
CREATE FUNCTION sp_insert_spo_files(
    p_drive_id UUID,
    p_files_json JSONB
) RETURNS INTEGER AS $$
DECLARE
    v_row_count INTEGER;
BEGIN
    INSERT INTO spo_files
        (id, drive_id, file_id, file_name, file_extension, size_bytes,
         created_at, last_modified, created_by, web_url, is_shared)
    SELECT
        gen_random_uuid(),
        p_drive_id,
        file_data->>'id',
        file_data->>'name',
        file_data->>'extension',
        (file_data->>'size')::BIGINT,
        (file_data->>'created')::TIMESTAMP,
        (file_data->>'modified')::TIMESTAMP,
        file_data->>'createdBy',
        file_data->>'webUrl',
        COALESCE((file_data->>'isShared')::BOOLEAN, false)
    FROM jsonb_array_elements(p_files_json) AS file_data;

    GET DIAGNOSTICS v_row_count = ROW_COUNT;
    RETURN v_row_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get Summary Report
CREATE FUNCTION sp_get_summary_report()
RETURNS TABLE (
    source VARCHAR,
    site_count BIGINT,
    drive_count BIGINT,
    file_count BIGINT,
    total_size_bytes BIGINT,
    shared_file_count BIGINT,
    last_collection_time TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'SharePoint'::VARCHAR, * FROM vw_spo_summary
    UNION ALL
    SELECT 'OneDrive'::VARCHAR, * FROM vw_od_summary;
END;
$$ LANGUAGE plpgsql;
