-- ============================================================================
-- Credit System Schema - Consumption Tracking and Monitoring
-- ============================================================================

-- ==========================
-- 1. CREDIT LEDGER TABLE
-- ==========================

-- All credit transactions (immutable)
CREATE TABLE [dbo].[credit_ledger] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [transaction_id] NVARCHAR(128) NOT NULL UNIQUE,
    [client_id] NVARCHAR(128) NOT NULL,
    [execution_id] NVARCHAR(128) NULL,
    [transaction_type] NVARCHAR(32) NOT NULL, -- 'purchase', 'consumption', 'refund', 'adjustment'
    [amount] DECIMAL(18,2) NOT NULL, -- Positive for purchase/refund, negative for consumption
    [description] NVARCHAR(512) NULL,
    [metadata] NVARCHAR(MAX) NULL, -- JSON with details (data_size_gb, sites_count, etc.)
    [created_by] NVARCHAR(256) NULL,
    [created_at] DATETIME2 DEFAULT GETUTCDATE() NOT NULL,
    CONSTRAINT [PK_credit_ledger] PRIMARY KEY CLUSTERED ([id]),
    INDEX [IX_ledger_client] NONCLUSTERED ([client_id]),
    INDEX [IX_ledger_execution] NONCLUSTERED ([execution_id]),
    INDEX [IX_ledger_date] NONCLUSTERED ([created_at] DESC),
    INDEX [IX_ledger_type] NONCLUSTERED ([transaction_type])
);

-- ==========================
-- 2. CLIENT CREDIT BALANCE TABLE
-- ==========================

-- Current balance per client (mutable)
CREATE TABLE [dbo].[client_credit_balance] (
    [client_id] NVARCHAR(128) NOT NULL,
    [plan_type] NVARCHAR(32) NOT NULL, -- 'starter', 'professional', 'enterprise', 'custom'
    [total_purchased_credits] DECIMAL(18,2) DEFAULT 0,
    [total_consumed_credits] DECIMAL(18,2) DEFAULT 0,
    [current_balance] DECIMAL(18,2) DEFAULT 0,
    [last_consumption_date] DATETIME2 NULL,
    [next_renewal_date] DATETIME2 NULL,
    [auto_refill_enabled] BIT DEFAULT 0,
    [auto_refill_amount] DECIMAL(18,2) NULL,
    [updated_at] DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_client_credit_balance] PRIMARY KEY CLUSTERED ([client_id]),
    INDEX [IX_balance_plan] NONCLUSTERED ([plan_type]),
    INDEX [IX_balance_updated] NONCLUSTERED ([updated_at] DESC)
);

-- ==========================
-- 3. EXECUTION CREDIT DETAILS TABLE
-- ==========================

-- Detailed breakdown of credits per execution
CREATE TABLE [dbo].[execution_credit_details] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [execution_id] NVARCHAR(128) NOT NULL,
    [client_id] NVARCHAR(128) NOT NULL,
    [data_collection_credits] DECIMAL(10,2) NOT NULL DEFAULT 0, -- Get-DataFiles, Get-TrashItems, etc.
    [data_size_gb] DECIMAL(18,2) NOT NULL DEFAULT 0,
    [storage_credits] DECIMAL(10,2) NOT NULL DEFAULT 0, -- 12-month storage cost
    [report_generation_credits] DECIMAL(10,2) NOT NULL DEFAULT 0,
    [alerts_generated] INT DEFAULT 0,
    [alerts_credits] DECIMAL(10,2) NOT NULL DEFAULT 0,
    [total_credits_consumed] DECIMAL(10,2) NOT NULL,
    [execution_date] DATETIME2 NOT NULL,
    [status] NVARCHAR(32) NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed'
    [created_at] DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT [PK_execution_credit_details] PRIMARY KEY CLUSTERED ([id]),
    UNIQUE NONCLUSTERED ([execution_id]),
    INDEX [IX_exec_client] NONCLUSTERED ([client_id]),
    INDEX [IX_exec_status] NONCLUSTERED ([status]),
    INDEX [IX_exec_date] NONCLUSTERED ([execution_date] DESC)
);

-- ==========================
-- 4. CREDIT ALERTS TABLE
-- ==========================

-- Alerts for credit usage milestones
CREATE TABLE [dbo].[credit_alerts] (
    [id] BIGINT IDENTITY(1,1) NOT NULL,
    [client_id] NVARCHAR(128) NOT NULL,
    [alert_type] NVARCHAR(32) NOT NULL, -- '80_percent', '90_percent', 'depleted', 'low_balance'
    [threshold_percent] INT NOT NULL,
    [current_usage_percent] INT NOT NULL,
    [current_balance] DECIMAL(18,2) NOT NULL,
    [total_credits] DECIMAL(18,2) NOT NULL,
    [alert_status] NVARCHAR(32) DEFAULT 'active', -- 'active', 'dismissed', 'acknowledged'
    [sent_at] DATETIME2 DEFAULT GETUTCDATE(),
    [dismissed_at] DATETIME2 NULL,
    [acknowledged_at] DATETIME2 NULL,
    CONSTRAINT [PK_credit_alerts] PRIMARY KEY CLUSTERED ([id]),
    INDEX [IX_alert_client] NONCLUSTERED ([client_id]),
    INDEX [IX_alert_type] NONCLUSTERED ([alert_type]),
    INDEX [IX_alert_status] NONCLUSTERED ([alert_status]),
    INDEX [IX_alert_date] NONCLUSTERED ([sent_at] DESC)
);

-- ==========================
-- 5. CREDIT PLANS REFERENCE TABLE
-- ==========================

CREATE TABLE [dbo].[credit_plan_reference] (
    [plan_id] INT PRIMARY KEY,
    [plan_name] NVARCHAR(64) NOT NULL, -- 'Starter', 'Professional', 'Enterprise', 'Custom'
    [monthly_credits] DECIMAL(10,2) NOT NULL,
    [annual_credits] DECIMAL(10,2) NOT NULL,
    [price_monthly_brl] DECIMAL(18,2) NOT NULL,
    [price_annual_brl] DECIMAL(18,2) NOT NULL,
    [annual_discount_percent] INT DEFAULT 0,
    [min_sites] INT,
    [max_sites] INT,
    [max_storage_gb] DECIMAL(18,2),
    [recommended_executions_per_month] INT,
    [description] NVARCHAR(MAX),
    [created_at] DATETIME2 DEFAULT GETUTCDATE(),
    [is_active] BIT DEFAULT 1
);

-- ==========================
-- 6. CREDIT CONSUMPTION RULES TABLE
-- ==========================

-- Configurable rules for credit calculation
CREATE TABLE [dbo].[credit_consumption_rules] (
    [id] INT PRIMARY KEY,
    [rule_name] NVARCHAR(128) NOT NULL,
    [credits_per_gb_data] DECIMAL(10,4) NOT NULL DEFAULT 0.002, -- 0.002 credits per GB
    [credits_per_execution] DECIMAL(10,2) NOT NULL DEFAULT 1.0, -- Base credit per execution
    [credits_per_report] DECIMAL(10,2) NOT NULL DEFAULT 0.25,
    [credits_per_100_alerts] DECIMAL(10,2) NOT NULL DEFAULT 0.1,
    [storage_months_included] INT NOT NULL DEFAULT 12,
    [storage_cost_per_gb_per_month_brl] DECIMAL(10,4) NOT NULL DEFAULT 0.2, -- R$0.20/GB/month
    [backup_multiplier] DECIMAL(10,2) NOT NULL DEFAULT 0.5, -- Backups = 50% of original storage
    [effective_from] DATETIME2 NOT NULL,
    [effective_until] DATETIME2 NULL,
    [is_active] BIT DEFAULT 1
);

-- ==========================
-- 7. STORED PROCEDURES
-- ==========================

-- Calculate credits for an execution
CREATE PROCEDURE [dbo].[sp_CalculateExecutionCredits]
    @ExecutionId NVARCHAR(128),
    @ClientId NVARCHAR(128),
    @DataSizeGb DECIMAL(18,2),
    @AlertsGenerated INT = 0,
    @ReportGenerated BIT = 0
AS
BEGIN
    DECLARE @DataCollectionCredits DECIMAL(10,2);
    DECLARE @StorageCredits DECIMAL(10,2);
    DECLARE @ReportCredits DECIMAL(10,2);
    DECLARE @AlertsCredits DECIMAL(10,2);
    DECLARE @TotalCredits DECIMAL(10,2);
    DECLARE @CreditsPerGb DECIMAL(10,4);
    DECLARE @CreditsPerExecution DECIMAL(10,2);
    DECLARE @StorageCostPerMonth DECIMAL(10,4);
    DECLARE @StorageMonths INT;
    DECLARE @BackupMultiplier DECIMAL(10,2);

    -- Get current consumption rules
    SELECT TOP 1
        @CreditsPerGb = credits_per_gb_data,
        @CreditsPerExecution = credits_per_execution,
        @StorageCostPerMonth = storage_cost_per_gb_per_month_brl,
        @StorageMonths = storage_months_included,
        @BackupMultiplier = backup_multiplier
    FROM [dbo].[credit_consumption_rules]
    WHERE is_active = 1
    ORDER BY effective_from DESC;

    -- Calculate each component
    -- Data collection: base execution + per GB
    SET @DataCollectionCredits = @CreditsPerExecution + (@DataSizeGb * @CreditsPerGb);

    -- Storage: 12-month cost (including backups)
    SET @StorageCredits =
        (@DataSizeGb * @StorageCostPerMonth * @StorageMonths * 1000) / 1000.0 / 1000.0; -- Convert to credits (R$1000 = 1 credit)

    -- Report generation
    SET @ReportCredits = CASE WHEN @ReportGenerated = 1 THEN 0.25 ELSE 0 END;

    -- Alerts: per 100 alerts
    SET @AlertsCredits = (@AlertsGenerated / 100.0) * 0.1;

    -- Total
    SET @TotalCredits = @DataCollectionCredits + @StorageCredits + @ReportCredits + @AlertsCredits;

    -- Insert or update execution credit details
    IF EXISTS (SELECT 1 FROM [dbo].[execution_credit_details] WHERE execution_id = @ExecutionId)
    BEGIN
        UPDATE [dbo].[execution_credit_details]
        SET
            data_collection_credits = @DataCollectionCredits,
            data_size_gb = @DataSizeGb,
            storage_credits = @StorageCredits,
            report_generation_credits = @ReportCredits,
            alerts_generated = @AlertsGenerated,
            alerts_credits = @AlertsCredits,
            total_credits_consumed = @TotalCredits
        WHERE execution_id = @ExecutionId;
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[execution_credit_details] (
            execution_id, client_id, data_collection_credits, data_size_gb,
            storage_credits, report_generation_credits, alerts_generated,
            alerts_credits, total_credits_consumed, execution_date, status
        )
        VALUES (
            @ExecutionId, @ClientId, @DataCollectionCredits, @DataSizeGb,
            @StorageCredits, @ReportCredits, @AlertsGenerated,
            @AlertsCredits, @TotalCredits, GETUTCDATE(), 'completed'
        );
    END

    -- Return calculated values
    SELECT
        @TotalCredits as total_credits,
        @DataCollectionCredits as data_collection_credits,
        @StorageCredits as storage_credits,
        @ReportCredits as report_credits,
        @AlertsCredits as alerts_credits;
END;
GO

-- Consume credits for execution
CREATE PROCEDURE [dbo].[sp_ConsumeCredits]
    @ExecutionId NVARCHAR(128),
    @ClientId NVARCHAR(128),
    @CreditsToConsume DECIMAL(18,2),
    @Description NVARCHAR(512) = NULL
AS
BEGIN
    DECLARE @CurrentBalance DECIMAL(18,2);
    DECLARE @TransactionId NVARCHAR(128) = NEWID();

    -- Check current balance
    SELECT @CurrentBalance = current_balance
    FROM [dbo].[client_credit_balance]
    WHERE client_id = @ClientId;

    -- Verify sufficient credits
    IF @CurrentBalance < @CreditsToConsume
    BEGIN
        THROW 50001, 'Insufficient credits for this execution', 1;
    END

    -- Record transaction in ledger
    INSERT INTO [dbo].[credit_ledger] (
        transaction_id, client_id, execution_id, transaction_type,
        amount, description, created_at
    )
    VALUES (
        @TransactionId, @ClientId, @ExecutionId, 'consumption',
        -@CreditsToConsume, @Description, GETUTCDATE()
    );

    -- Update balance
    UPDATE [dbo].[client_credit_balance]
    SET
        total_consumed_credits = total_consumed_credits + @CreditsToConsume,
        current_balance = current_balance - @CreditsToConsume,
        last_consumption_date = GETUTCDATE(),
        updated_at = GETUTCDATE()
    WHERE client_id = @ClientId;

    -- Check if alert should be triggered (80% usage)
    DECLARE @NewBalance DECIMAL(18,2);
    DECLARE @TotalCredits DECIMAL(18,2);
    DECLARE @UsagePercent INT;

    SELECT @NewBalance = current_balance, @TotalCredits = total_purchased_credits
    FROM [dbo].[client_credit_balance]
    WHERE client_id = @ClientId;

    SET @UsagePercent = CAST(((@TotalCredits - @NewBalance) / @TotalCredits) * 100 AS INT);

    -- Insert alert if usage >= 80%
    IF @UsagePercent >= 80 AND NOT EXISTS (
        SELECT 1 FROM [dbo].[credit_alerts]
        WHERE client_id = @ClientId
        AND alert_status = 'active'
        AND alert_type = '80_percent'
        AND DATEDIFF(DAY, sent_at, GETUTCDATE()) < 1 -- Max 1 per day
    )
    BEGIN
        INSERT INTO [dbo].[credit_alerts] (
            client_id, alert_type, threshold_percent, current_usage_percent,
            current_balance, total_credits, alert_status
        )
        VALUES (
            @ClientId, '80_percent', 80, @UsagePercent,
            @NewBalance, @TotalCredits, 'active'
        );
    END

    -- Return new balance
    SELECT @NewBalance as remaining_balance, @UsagePercent as usage_percent;
END;
GO

-- Add credits to client account
CREATE PROCEDURE [dbo].[sp_AddCredits]
    @ClientId NVARCHAR(128),
    @CreditsToAdd DECIMAL(18,2),
    @TransactionType NVARCHAR(32) = 'purchase', -- 'purchase', 'refund', 'adjustment'
    @Description NVARCHAR(512) = NULL
AS
BEGIN
    DECLARE @TransactionId NVARCHAR(128) = NEWID();

    -- Record transaction in ledger
    INSERT INTO [dbo].[credit_ledger] (
        transaction_id, client_id, transaction_type,
        amount, description, created_at
    )
    VALUES (
        @TransactionId, @ClientId, @TransactionType,
        @CreditsToAdd, @Description, GETUTCDATE()
    );

    -- Update or create balance record
    IF EXISTS (SELECT 1 FROM [dbo].[client_credit_balance] WHERE client_id = @ClientId)
    BEGIN
        UPDATE [dbo].[client_credit_balance]
        SET
            total_purchased_credits = total_purchased_credits + @CreditsToAdd,
            current_balance = current_balance + @CreditsToAdd,
            updated_at = GETUTCDATE()
        WHERE client_id = @ClientId;
    END
    ELSE
    BEGIN
        INSERT INTO [dbo].[client_credit_balance] (
            client_id, plan_type, total_purchased_credits, current_balance, updated_at
        )
        VALUES (
            @ClientId, 'custom', @CreditsToAdd, @CreditsToAdd, GETUTCDATE()
        );
    END

    -- Clear alerts since balance was added
    UPDATE [dbo].[credit_alerts]
    SET alert_status = 'dismissed'
    WHERE client_id = @ClientId
    AND alert_status = 'active'
    AND alert_type IN ('80_percent', '90_percent', 'depleted');

    -- Return new balance
    SELECT current_balance
    FROM [dbo].[client_credit_balance]
    WHERE client_id = @ClientId;
END;
GO

-- Get credit usage analytics
CREATE PROCEDURE [dbo].[sp_GetCreditUsageAnalytics]
    @ClientId NVARCHAR(128)
AS
BEGIN
    SELECT
        ccb.current_balance,
        ccb.total_purchased_credits,
        ccb.total_consumed_credits,
        CAST((CASE WHEN ccb.total_purchased_credits > 0
            THEN (ccb.total_consumed_credits / ccb.total_purchased_credits) * 100
            ELSE 0
        END) AS INT) as usage_percent,
        CAST((CASE WHEN ccb.total_purchased_credits > 0
            THEN (ccb.current_balance / ccb.total_purchased_credits) * 100
            ELSE 0
        END) AS INT) as remaining_percent,
        ccb.last_consumption_date,
        ccb.plan_type,
        ccb.updated_at,
        (SELECT COUNT(*) FROM [dbo].[execution_credit_details] WHERE client_id = @ClientId) as total_executions,
        (SELECT SUM(total_credits_consumed) FROM [dbo].[execution_credit_details] WHERE client_id = @ClientId) as sum_credits_consumed,
        (SELECT AVG(total_credits_consumed) FROM [dbo].[execution_credit_details] WHERE client_id = @ClientId) as avg_credits_per_execution
    FROM [dbo].[client_credit_balance] ccb
    WHERE ccb.client_id = @ClientId;
END;
GO

-- Get credit ledger (transaction history)
CREATE PROCEDURE [dbo].[sp_GetCreditLedger]
    @ClientId NVARCHAR(128),
    @Limit INT = 100,
    @Offset INT = 0
AS
BEGIN
    SELECT
        [id],
        [transaction_id],
        [transaction_type],
        [amount],
        [description],
        [execution_id],
        [created_at]
    FROM [dbo].[credit_ledger]
    WHERE client_id = @ClientId
    ORDER BY created_at DESC
    OFFSET @Offset ROWS
    FETCH NEXT @Limit ROWS ONLY;
END;
GO

-- Get active alerts
CREATE PROCEDURE [dbo].[sp_GetCreditAlerts]
    @ClientId NVARCHAR(128)
AS
BEGIN
    SELECT
        [id],
        [alert_type],
        [threshold_percent],
        [current_usage_percent],
        [current_balance],
        [total_credits],
        [alert_status],
        [sent_at],
        [dismissed_at]
    FROM [dbo].[credit_alerts]
    WHERE client_id = @ClientId
    AND alert_status = 'active'
    ORDER BY sent_at DESC;
END;
GO

-- ==========================
-- 8. INITIALIZE CREDIT CONSUMPTION RULES
-- ==========================

INSERT INTO [dbo].[credit_consumption_rules] (
    id, rule_name, credits_per_gb_data, credits_per_execution,
    credits_per_report, credits_per_100_alerts, storage_months_included,
    storage_cost_per_gb_per_month_brl, backup_multiplier,
    effective_from, is_active
)
VALUES (
    1,
    'Standard Pricing Model',
    0.002,    -- R$2/GB = 0.002 credits
    1.0,      -- 1 credit base per execution
    0.25,     -- 0.25 credits per report
    0.1,      -- 0.1 credits per 100 alerts
    12,       -- 12 months storage included
    0.20,     -- R$0.20/GB/month
    0.5,      -- Backups = 50% of original
    GETUTCDATE(),
    1
);

-- ==========================
-- 9. INITIALIZE CREDIT PLANS
-- ==========================

INSERT INTO [dbo].[credit_plan_reference] (
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
