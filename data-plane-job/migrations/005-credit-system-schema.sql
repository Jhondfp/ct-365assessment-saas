-- ============================================================================
-- Credit System Schema - Consumption Tracking and Monitoring
-- ============================================================================

-- ==========================
-- 1. CREDIT LEDGER TABLE
-- ==========================

-- All credit transactions (immutable)
CREATE TABLE credit_ledger (
    id BIGSERIAL NOT NULL,
    transaction_id VARCHAR(128) NOT NULL UNIQUE,
    client_id VARCHAR(128) NOT NULL,
    execution_id VARCHAR(128) NULL,
    transaction_type VARCHAR(32) NOT NULL,
    amount DECIMAL(18,2) NOT NULL,
    description VARCHAR(512) NULL,
    metadata TEXT NULL,
    created_by VARCHAR(256) NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT ix_ledger_client UNIQUE (client_id),
    CONSTRAINT ix_ledger_execution UNIQUE (execution_id),
    CONSTRAINT ix_ledger_date UNIQUE (created_at),
    CONSTRAINT ix_ledger_type UNIQUE (transaction_type)
);

-- ==========================
-- 2. CLIENT CREDIT BALANCE TABLE
-- ==========================

-- Current balance per client (mutable)
CREATE TABLE client_credit_balance (
    client_id VARCHAR(128) NOT NULL,
    plan_type VARCHAR(32) NOT NULL,
    total_purchased_credits DECIMAL(18,2) DEFAULT 0,
    total_consumed_credits DECIMAL(18,2) DEFAULT 0,
    current_balance DECIMAL(18,2) DEFAULT 0,
    last_consumption_date TIMESTAMP NULL,
    next_renewal_date TIMESTAMP NULL,
    auto_refill_enabled BOOLEAN DEFAULT FALSE,
    auto_refill_amount DECIMAL(18,2) NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (client_id),
    CONSTRAINT ix_balance_plan UNIQUE (plan_type),
    CONSTRAINT ix_balance_updated UNIQUE (updated_at)
);

-- ==========================
-- 3. EXECUTION CREDIT DETAILS TABLE
-- ==========================

-- Detailed breakdown of credits per execution
CREATE TABLE execution_credit_details (
    id BIGSERIAL NOT NULL,
    execution_id VARCHAR(128) NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    data_collection_credits DECIMAL(10,2) NOT NULL DEFAULT 0,
    data_size_gb DECIMAL(18,2) NOT NULL DEFAULT 0,
    storage_credits DECIMAL(10,2) NOT NULL DEFAULT 0,
    report_generation_credits DECIMAL(10,2) NOT NULL DEFAULT 0,
    alerts_generated INTEGER DEFAULT 0,
    alerts_credits DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_credits_consumed DECIMAL(10,2) NOT NULL,
    execution_date TIMESTAMP NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (id),
    UNIQUE (execution_id),
    CONSTRAINT ix_exec_client UNIQUE (client_id),
    CONSTRAINT ix_exec_status UNIQUE (status),
    CONSTRAINT ix_exec_date UNIQUE (execution_date)
);

-- ==========================
-- 4. CREDIT ALERTS TABLE
-- ==========================

-- Alerts for credit usage milestones
CREATE TABLE credit_alerts (
    id BIGSERIAL NOT NULL,
    client_id VARCHAR(128) NOT NULL,
    alert_type VARCHAR(32) NOT NULL,
    threshold_percent INTEGER NOT NULL,
    current_usage_percent INTEGER NOT NULL,
    current_balance DECIMAL(18,2) NOT NULL,
    total_credits DECIMAL(18,2) NOT NULL,
    alert_status VARCHAR(32) DEFAULT 'active',
    sent_at TIMESTAMP DEFAULT NOW(),
    dismissed_at TIMESTAMP NULL,
    acknowledged_at TIMESTAMP NULL,
    PRIMARY KEY (id),
    CONSTRAINT ix_alert_client UNIQUE (client_id),
    CONSTRAINT ix_alert_type UNIQUE (alert_type),
    CONSTRAINT ix_alert_status UNIQUE (alert_status),
    CONSTRAINT ix_alert_date UNIQUE (sent_at)
);

-- ==========================
-- 5. CREDIT PLANS REFERENCE TABLE
-- ==========================

CREATE TABLE credit_plan_reference (
    plan_id INTEGER PRIMARY KEY,
    plan_name VARCHAR(64) NOT NULL,
    monthly_credits DECIMAL(10,2) NOT NULL,
    annual_credits DECIMAL(10,2) NOT NULL,
    price_monthly_brl DECIMAL(18,2) NOT NULL,
    price_annual_brl DECIMAL(18,2) NOT NULL,
    annual_discount_percent INTEGER DEFAULT 0,
    min_sites INTEGER,
    max_sites INTEGER,
    max_storage_gb DECIMAL(18,2),
    recommended_executions_per_month INTEGER,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE
);

-- ==========================
-- 6. CREDIT CONSUMPTION RULES TABLE
-- ==========================

-- Configurable rules for credit calculation
CREATE TABLE credit_consumption_rules (
    id INTEGER PRIMARY KEY,
    rule_name VARCHAR(128) NOT NULL,
    credits_per_gb_data DECIMAL(10,4) NOT NULL DEFAULT 0.002,
    credits_per_execution DECIMAL(10,2) NOT NULL DEFAULT 1.0,
    credits_per_report DECIMAL(10,2) NOT NULL DEFAULT 0.25,
    credits_per_100_alerts DECIMAL(10,2) NOT NULL DEFAULT 0.1,
    storage_months_included INTEGER NOT NULL DEFAULT 12,
    storage_cost_per_gb_per_month_brl DECIMAL(10,4) NOT NULL DEFAULT 0.2,
    backup_multiplier DECIMAL(10,2) NOT NULL DEFAULT 0.5,
    effective_from TIMESTAMP NOT NULL,
    effective_until TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE
);

-- ==========================
-- 7. STORED PROCEDURES
-- ==========================

-- Function to calculate credits for an execution
CREATE OR REPLACE FUNCTION sp_calculate_execution_credits(
    execution_id_param VARCHAR(128),
    client_id_param VARCHAR(128),
    data_size_gb_param DECIMAL(18,2),
    alerts_generated_param INTEGER DEFAULT 0,
    report_generated_param BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(total_credits DECIMAL, data_collection_credits DECIMAL, storage_credits DECIMAL, report_credits DECIMAL, alerts_credits DECIMAL) AS $$
DECLARE
    v_data_collection_credits DECIMAL(10,2);
    v_storage_credits DECIMAL(10,2);
    v_report_credits DECIMAL(10,2);
    v_alerts_credits DECIMAL(10,2);
    v_total_credits DECIMAL(10,2);
    v_credits_per_gb DECIMAL(10,4);
    v_credits_per_execution DECIMAL(10,2);
    v_storage_cost_per_month DECIMAL(10,4);
    v_storage_months INTEGER;
    v_backup_multiplier DECIMAL(10,2);
BEGIN
    -- Get current consumption rules
    SELECT credits_per_gb_data, credits_per_execution, storage_cost_per_gb_per_month_brl, storage_months_included, backup_multiplier
    INTO v_credits_per_gb, v_credits_per_execution, v_storage_cost_per_month, v_storage_months, v_backup_multiplier
    FROM credit_consumption_rules
    WHERE is_active = TRUE
    ORDER BY effective_from DESC
    LIMIT 1;

    -- Calculate each component
    -- Data collection: base execution + per GB
    v_data_collection_credits := v_credits_per_execution + (data_size_gb_param * v_credits_per_gb);

    -- Storage: 12-month cost (including backups)
    v_storage_credits := (data_size_gb_param * v_storage_cost_per_month * v_storage_months * 1000) / 1000.0 / 1000.0;

    -- Report generation
    v_report_credits := CASE WHEN report_generated_param = TRUE THEN 0.25 ELSE 0 END;

    -- Alerts: per 100 alerts
    v_alerts_credits := (alerts_generated_param / 100.0) * 0.1;

    -- Total
    v_total_credits := v_data_collection_credits + v_storage_credits + v_report_credits + v_alerts_credits;

    -- Insert or update execution credit details
    IF EXISTS (SELECT 1 FROM execution_credit_details WHERE execution_id = execution_id_param) THEN
        UPDATE execution_credit_details
        SET
            data_collection_credits = v_data_collection_credits,
            data_size_gb = data_size_gb_param,
            storage_credits = v_storage_credits,
            report_generation_credits = v_report_credits,
            alerts_generated = alerts_generated_param,
            alerts_credits = v_alerts_credits,
            total_credits_consumed = v_total_credits
        WHERE execution_id = execution_id_param;
    ELSE
        INSERT INTO execution_credit_details (
            execution_id, client_id, data_collection_credits, data_size_gb,
            storage_credits, report_generation_credits, alerts_generated,
            alerts_credits, total_credits_consumed, execution_date, status
        )
        VALUES (
            execution_id_param, client_id_param, v_data_collection_credits, data_size_gb_param,
            v_storage_credits, v_report_credits, alerts_generated_param,
            v_alerts_credits, v_total_credits, NOW(), 'completed'
        );
    END IF;

    -- Return calculated values
    RETURN QUERY SELECT v_total_credits, v_data_collection_credits, v_storage_credits, v_report_credits, v_alerts_credits;
END;
$$ LANGUAGE plpgsql;

-- Function to consume credits for execution
CREATE OR REPLACE FUNCTION sp_consume_credits(
    execution_id_param VARCHAR(128),
    client_id_param VARCHAR(128),
    credits_to_consume_param DECIMAL(18,2),
    description_param VARCHAR(512) DEFAULT NULL
)
RETURNS TABLE(remaining_balance DECIMAL, usage_percent INTEGER) AS $$
DECLARE
    v_current_balance DECIMAL(18,2);
    v_transaction_id VARCHAR(128);
    v_new_balance DECIMAL(18,2);
    v_total_credits DECIMAL(18,2);
    v_usage_percent INTEGER;
BEGIN
    -- Generate transaction ID
    v_transaction_id := gen_random_uuid()::VARCHAR;

    -- Check current balance
    SELECT current_balance INTO v_current_balance
    FROM client_credit_balance
    WHERE client_id = client_id_param;

    -- Verify sufficient credits
    IF v_current_balance < credits_to_consume_param THEN
        RAISE EXCEPTION 'Insufficient credits for this execution';
    END IF;

    -- Record transaction in ledger
    INSERT INTO credit_ledger (
        transaction_id, client_id, execution_id, transaction_type,
        amount, description, created_at
    )
    VALUES (
        v_transaction_id, client_id_param, execution_id_param, 'consumption',
        -credits_to_consume_param, description_param, NOW()
    );

    -- Update balance
    UPDATE client_credit_balance
    SET
        total_consumed_credits = total_consumed_credits + credits_to_consume_param,
        current_balance = current_balance - credits_to_consume_param,
        last_consumption_date = NOW(),
        updated_at = NOW()
    WHERE client_id = client_id_param;

    -- Get new balance for alert checking
    SELECT current_balance, total_purchased_credits INTO v_new_balance, v_total_credits
    FROM client_credit_balance
    WHERE client_id = client_id_param;

    v_usage_percent := CAST((CASE WHEN v_total_credits > 0 THEN ((v_total_credits - v_new_balance) / v_total_credits) * 100 ELSE 0 END) AS INTEGER);

    -- Insert alert if usage >= 80%
    IF v_usage_percent >= 80 AND NOT EXISTS (
        SELECT 1 FROM credit_alerts
        WHERE client_id = client_id_param
        AND alert_status = 'active'
        AND alert_type = '80_percent'
        AND EXTRACT(DAY FROM (NOW() - sent_at)) < 1
    ) THEN
        INSERT INTO credit_alerts (
            client_id, alert_type, threshold_percent, current_usage_percent,
            current_balance, total_credits, alert_status
        )
        VALUES (
            client_id_param, '80_percent', 80, v_usage_percent,
            v_new_balance, v_total_credits, 'active'
        );
    END IF;

    -- Return new balance
    RETURN QUERY SELECT v_new_balance, v_usage_percent;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits to client account
CREATE OR REPLACE FUNCTION sp_add_credits(
    client_id_param VARCHAR(128),
    credits_to_add_param DECIMAL(18,2),
    transaction_type_param VARCHAR(32) DEFAULT 'purchase',
    description_param VARCHAR(512) DEFAULT NULL
)
RETURNS TABLE(current_balance DECIMAL) AS $$
DECLARE
    v_transaction_id VARCHAR(128);
BEGIN
    -- Generate transaction ID
    v_transaction_id := gen_random_uuid()::VARCHAR;

    -- Record transaction in ledger
    INSERT INTO credit_ledger (
        transaction_id, client_id, transaction_type,
        amount, description, created_at
    )
    VALUES (
        v_transaction_id, client_id_param, transaction_type_param,
        credits_to_add_param, description_param, NOW()
    );

    -- Update or create balance record
    IF EXISTS (SELECT 1 FROM client_credit_balance WHERE client_id = client_id_param) THEN
        UPDATE client_credit_balance
        SET
            total_purchased_credits = total_purchased_credits + credits_to_add_param,
            current_balance = current_balance + credits_to_add_param,
            updated_at = NOW()
        WHERE client_id = client_id_param;
    ELSE
        INSERT INTO client_credit_balance (
            client_id, plan_type, total_purchased_credits, current_balance, updated_at
        )
        VALUES (
            client_id_param, 'custom', credits_to_add_param, credits_to_add_param, NOW()
        );
    END IF;

    -- Clear alerts since balance was added
    UPDATE credit_alerts
    SET alert_status = 'dismissed'
    WHERE client_id = client_id_param
    AND alert_status = 'active'
    AND alert_type IN ('80_percent', '90_percent', 'depleted');

    -- Return new balance
    RETURN QUERY
    SELECT current_balance
    FROM client_credit_balance
    WHERE client_id = client_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function to get credit usage analytics
CREATE OR REPLACE FUNCTION sp_get_credit_usage_analytics(client_id_param VARCHAR(128))
RETURNS TABLE(current_balance DECIMAL, total_purchased_credits DECIMAL, total_consumed_credits DECIMAL, usage_percent INTEGER, remaining_percent INTEGER, last_consumption_date TIMESTAMP, plan_type VARCHAR, updated_at TIMESTAMP, total_executions BIGINT, sum_credits_consumed DECIMAL, avg_credits_per_execution DECIMAL) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ccb.current_balance,
        ccb.total_purchased_credits,
        ccb.total_consumed_credits,
        CAST((CASE WHEN ccb.total_purchased_credits > 0 THEN (ccb.total_consumed_credits / ccb.total_purchased_credits) * 100 ELSE 0 END) AS INTEGER),
        CAST((CASE WHEN ccb.total_purchased_credits > 0 THEN (ccb.current_balance / ccb.total_purchased_credits) * 100 ELSE 0 END) AS INTEGER),
        ccb.last_consumption_date,
        ccb.plan_type,
        ccb.updated_at,
        (SELECT COUNT(*) FROM execution_credit_details WHERE client_id = client_id_param),
        (SELECT SUM(total_credits_consumed) FROM execution_credit_details WHERE client_id = client_id_param),
        (SELECT AVG(total_credits_consumed) FROM execution_credit_details WHERE client_id = client_id_param)
    FROM client_credit_balance ccb
    WHERE ccb.client_id = client_id_param;
END;
$$ LANGUAGE plpgsql;

-- Function to get credit ledger (transaction history)
CREATE OR REPLACE FUNCTION sp_get_credit_ledger(
    client_id_param VARCHAR(128),
    limit_param INTEGER DEFAULT 100,
    offset_param INTEGER DEFAULT 0
)
RETURNS TABLE(id BIGINT, transaction_id VARCHAR, transaction_type VARCHAR, amount DECIMAL, description VARCHAR, execution_id VARCHAR, created_at TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT
        cl.id,
        cl.transaction_id,
        cl.transaction_type,
        cl.amount,
        cl.description,
        cl.execution_id,
        cl.created_at
    FROM credit_ledger cl
    WHERE cl.client_id = client_id_param
    ORDER BY cl.created_at DESC
    LIMIT limit_param OFFSET offset_param;
END;
$$ LANGUAGE plpgsql;

-- Function to get active alerts
CREATE OR REPLACE FUNCTION sp_get_credit_alerts(client_id_param VARCHAR(128))
RETURNS TABLE(id BIGINT, alert_type VARCHAR, threshold_percent INTEGER, current_usage_percent INTEGER, current_balance DECIMAL, total_credits DECIMAL, alert_status VARCHAR, sent_at TIMESTAMP, dismissed_at TIMESTAMP) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ca.id,
        ca.alert_type,
        ca.threshold_percent,
        ca.current_usage_percent,
        ca.current_balance,
        ca.total_credits,
        ca.alert_status,
        ca.sent_at,
        ca.dismissed_at
    FROM credit_alerts ca
    WHERE ca.client_id = client_id_param
    AND ca.alert_status = 'active'
    ORDER BY ca.sent_at DESC;
END;
$$ LANGUAGE plpgsql;

-- ==========================
-- 8. INITIALIZE CREDIT CONSUMPTION RULES
-- ==========================

INSERT INTO credit_consumption_rules (
    id, rule_name, credits_per_gb_data, credits_per_execution,
    credits_per_report, credits_per_100_alerts, storage_months_included,
    storage_cost_per_gb_per_month_brl, backup_multiplier,
    effective_from, is_active
)
VALUES (
    1,
    'Standard Pricing Model',
    0.002,
    1.0,
    0.25,
    0.1,
    12,
    0.20,
    0.5,
    NOW(),
    TRUE
);

-- ==========================
-- 9. INITIALIZE CREDIT PLANS
-- ==========================

INSERT INTO credit_plan_reference (
    plan_id, plan_name, monthly_credits, annual_credits,
    price_monthly_brl, price_annual_brl, annual_discount_percent,
    min_sites, max_sites, max_storage_gb,
    recommended_executions_per_month, description
)
VALUES
    (1, 'Starter', 2.0, 24.0, 2000, 24000, 0, 100, 300, 1000, 1,
     'Perfect for small companies with monthly audits'),
    (2, 'Professional', 4.0, 48.0, 4000, 48000, 25, 300, 800, 5000, 2,
     'Ideal for medium-sized companies with regular monitoring'),
    (3, 'Enterprise', 6.0, 72.0, 6000, 72000, 35, 800, 9999, 50000, 4,
     'Best for large enterprises with continuous governance'),
    (4, 'Custom', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     'Custom plan tailored to specific needs');
