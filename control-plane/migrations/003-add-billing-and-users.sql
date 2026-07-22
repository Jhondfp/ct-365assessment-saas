-- ======================================
-- MIGRATION: Billing, Credits, Users, App Registration
-- ======================================

-- ======================================
-- 01. APP REGISTRATION (Multi-Tenant)
-- ======================================
CREATE TABLE [dbo].[app_registrations] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [tenant_id] UNIQUEIDENTIFIER NOT NULL,
    [app_id] NVARCHAR(36) NOT NULL UNIQUE,
    [app_secret] NVARCHAR(MAX) NOT NULL, -- Encrypted in Key Vault
    [app_secret_key_vault_id] NVARCHAR(255) NULL, -- Reference ao Key Vault
    [redirect_uri] NVARCHAR(2048) NOT NULL,
    [scopes] NVARCHAR(MAX) NOT NULL, -- JSON array: ["Sites.Read.All", "Files.Read.All", etc]
    [status] VARCHAR(20) NOT NULL DEFAULT 'active' CHECK ([status] IN ('active', 'inactive', 'expired')),
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [expira_em] DATETIME2 NULL,
    FOREIGN KEY ([tenant_id]) REFERENCES [dbo].[tenants]([id]) ON DELETE CASCADE
);

CREATE INDEX [idx_app_registrations_tenant_id] ON [dbo].[app_registrations]([tenant_id]);
CREATE INDEX [idx_app_registrations_app_id] ON [dbo].[app_registrations]([app_id]);
CREATE INDEX [idx_app_registrations_status] ON [dbo].[app_registrations]([status]);

-- ======================================
-- 02. CRÉDITOS (Billing/Consumption)
-- ======================================
CREATE TABLE [dbo].[credit_plans] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [nome] NVARCHAR(255) NOT NULL UNIQUE,
    [descricao] NVARCHAR(MAX) NULL,
    [creditos_inclusos] DECIMAL(15, 2) NOT NULL,
    [valor_mensal_brl] DECIMAL(10, 2) NOT NULL,
    [valor_credito_excedente_brl] DECIMAL(10, 4) NOT NULL, -- Por crédito usado além do plano
    [limite_usuarios] INT NULL, -- null = ilimitado
    [limite_assessments_mes] INT NULL, -- null = ilimitado
    [ativo] BIT NOT NULL DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE INDEX [idx_credit_plans_ativo] ON [dbo].[credit_plans]([ativo]);

-- Inserir planos padrão
INSERT INTO [dbo].[credit_plans] ([nome], [descricao], [creditos_inclusos], [valor_mensal_brl], [valor_credito_excedente_brl], [limite_usuarios], [limite_assessments_mes])
VALUES
    ('Starter', 'Para equipes pequenas', 10, 99.00, 0.50, 3, 5),
    ('Professional', 'Para departamentos', 50, 299.00, 0.40, 10, 20),
    ('Enterprise', 'Solução customizada', 500, 999.00, 0.30, NULL, NULL);

-- Créditos por cliente
CREATE TABLE [dbo].[client_credits] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [plan_id] UNIQUEIDENTIFIER NOT NULL,
    [creditos_saldo] DECIMAL(15, 2) NOT NULL DEFAULT 0,
    [creditos_consumidos_mes] DECIMAL(15, 2) NOT NULL DEFAULT 0,
    [data_renovacao_creditos] DATETIME2 NOT NULL,
    [ativo] BIT NOT NULL DEFAULT 1,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([plan_id]) REFERENCES [dbo].[credit_plans]([id])
);

CREATE INDEX [idx_client_credits_client_id] ON [dbo].[client_credits]([client_id]);
CREATE INDEX [idx_client_credits_ativo] ON [dbo].[client_credits]([ativo]);

-- Histórico de transações de crédito
CREATE TABLE [dbo].[credit_transactions] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [execution_id] UNIQUEIDENTIFIER NULL, -- NULL se for ajuste manual
    [tipo] VARCHAR(30) NOT NULL CHECK ([tipo] IN ('purchase', 'consumption', 'refund', 'adjustment', 'renewal')),
    [creditos_alterados] DECIMAL(15, 2) NOT NULL,
    [saldo_anterior] DECIMAL(15, 2) NOT NULL,
    [saldo_novo] DECIMAL(15, 2) NOT NULL,
    [descricao] NVARCHAR(MAX) NULL,
    [criado_por] UNIQUEIDENTIFIER NULL, -- Usuário que fez a transação
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]),
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id]),
    FOREIGN KEY ([criado_por]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [idx_credit_transactions_client_id] ON [dbo].[credit_transactions]([client_id]);
CREATE INDEX [idx_credit_transactions_type] ON [dbo].[credit_transactions]([tipo]);
CREATE INDEX [idx_credit_transactions_execution_id] ON [dbo].[credit_transactions]([execution_id]);

-- ======================================
-- 03. USUÁRIOS (Admin + Customer)
-- ======================================

-- Atualizar tabela users com campos adicionais
ALTER TABLE [dbo].[users]
ADD [tipo] VARCHAR(20) DEFAULT 'admin' CHECK ([tipo] IN ('admin', 'customer')),
    [client_id] UNIQUEIDENTIFIER NULL, -- Para usuários de cliente
    [cargo] NVARCHAR(255) NULL,
    [telefone] NVARCHAR(20) NULL,
    [foto_url] NVARCHAR(2048) NULL,
    [idioma] VARCHAR(10) DEFAULT 'pt-BR' CHECK ([idioma] IN ('pt-BR', 'en-US', 'es-ES')),
    [timezone] VARCHAR(50) DEFAULT 'America/Sao_Paulo',
    [notificacoes_email] BIT DEFAULT 1,
    [notificacoes_sms] BIT DEFAULT 0;

-- Criar restrição de FK
ALTER TABLE [dbo].[users]
ADD CONSTRAINT [fk_users_client]
FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]) ON DELETE CASCADE;

-- Índices
CREATE INDEX [idx_users_client_id] ON [dbo].[users]([client_id]);
CREATE INDEX [idx_users_tipo] ON [dbo].[users]([tipo]);

-- ======================================
-- 04. CONVITES DE USUÁRIOS
-- ======================================
CREATE TABLE [dbo].[user_invites] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [email] NVARCHAR(255) NOT NULL,
    [papel] VARCHAR(20) NOT NULL CHECK ([papel] IN ('superadmin', 'analista', 'viewer', 'viewer_cliente')),
    [token] NVARCHAR(255) NOT NULL UNIQUE,
    [status] VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK ([status] IN ('pending', 'accepted', 'expired', 'cancelled')),
    [criado_por] UNIQUEIDENTIFIER NOT NULL,
    [aceito_em] DATETIME2 NULL,
    [expira_em] DATETIME2 NOT NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]) ON DELETE CASCADE,
    FOREIGN KEY ([criado_por]) REFERENCES [dbo].[users]([id])
);

CREATE INDEX [idx_user_invites_client_id] ON [dbo].[user_invites]([client_id]);
CREATE INDEX [idx_user_invites_status] ON [dbo].[user_invites]([status]);
CREATE INDEX [idx_user_invites_token] ON [dbo].[user_invites]([token]);

-- ======================================
-- 05. ATUALIZAR EXECUTIONS COM CUSTO
-- ======================================
ALTER TABLE [dbo].[executions]
ADD [creditos_utilizados] DECIMAL(15, 2) NULL,
    [creditos_custo_calculation] NVARCHAR(MAX) NULL -- JSON com detalhe do cálculo

-- ======================================
-- 06. CONSUMO DE CRÉDITOS (Histórico)
-- ======================================
CREATE TABLE [dbo].[consumo_assessments] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [execution_id] UNIQUEIDENTIFIER NOT NULL,
    [gb_processado] DECIMAL(15, 2) NOT NULL,
    [creditos_utilizados] DECIMAL(15, 2) NOT NULL,
    [valor_credito_unitario] DECIMAL(10, 4) NOT NULL,
    [data_assessment] DATETIME2 NOT NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id]),
    FOREIGN KEY ([execution_id]) REFERENCES [dbo].[executions]([id])
);

CREATE INDEX [idx_consumo_assessments_client_id] ON [dbo].[consumo_assessments]([client_id]);
CREATE INDEX [idx_consumo_assessments_execution_id] ON [dbo].[consumo_assessments]([execution_id]);
CREATE INDEX [idx_consumo_assessments_data] ON [dbo].[consumo_assessments]([data_assessment]);

-- ======================================
-- 07. ARMAZÉM DE DADOS (Relatórios)
-- ======================================
CREATE TABLE [dbo].[faturas] (
    [id] UNIQUEIDENTIFIER NOT NULL PRIMARY KEY DEFAULT NEWID(),
    [client_id] UNIQUEIDENTIFIER NOT NULL,
    [numero_nf] NVARCHAR(50) NOT NULL UNIQUE,
    [mes_referencia] VARCHAR(7) NOT NULL, -- YYYY-MM
    [creditos_consumidos] DECIMAL(15, 2) NOT NULL,
    [creditos_inclusos_plano] DECIMAL(15, 2) NOT NULL,
    [creditos_excedentes] DECIMAL(15, 2) NOT NULL DEFAULT 0,
    [valor_base_plano] DECIMAL(10, 2) NOT NULL,
    [valor_excedentes] DECIMAL(10, 2) NOT NULL DEFAULT 0,
    [valor_total_brl] DECIMAL(10, 2) NOT NULL,
    [status] VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK ([status] IN ('draft', 'emitida', 'paga', 'cancelada')),
    [data_emissao] DATETIME2 NULL,
    [data_vencimento] DATETIME2 NULL,
    [data_pagamento] DATETIME2 NULL,
    [criado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    [atualizado_em] DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    FOREIGN KEY ([client_id]) REFERENCES [dbo].[clients]([id])
);

CREATE INDEX [idx_faturas_client_id] ON [dbo].[faturas]([client_id]);
CREATE INDEX [idx_faturas_mes] ON [dbo].[faturas]([mes_referencia]);
CREATE INDEX [idx_faturas_status] ON [dbo].[faturas]([status]);

-- ======================================
-- STORED PROCEDURES
-- ======================================

-- Procedure: Adicionar Usuário ao Cliente
CREATE PROCEDURE [dbo].[sp_AddUserToClient]
    @UserId UNIQUEIDENTIFIER,
    @ClientId UNIQUEIDENTIFIER,
    @Papel VARCHAR(20),
    @Cargo NVARCHAR(255) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [dbo].[users]
    SET
        [client_id] = @ClientId,
        [tipo] = 'customer',
        [papel] = @Papel,
        [cargo] = @Cargo,
        [atualizado_em] = GETUTCDATE()
    WHERE [id] = @UserId;

    SELECT @@ROWCOUNT as [affected_rows];
END;

-- Procedure: Consumir Créditos
CREATE PROCEDURE [dbo].[sp_ConsumeCredits]
    @ClientId UNIQUEIDENTIFIER,
    @ExecutionId UNIQUEIDENTIFIER,
    @CreditosAConsumir DECIMAL(15, 2),
    @DescricaoConsumo NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRANSACTION;

    -- Verificar saldo
    DECLARE @SaldoAtual DECIMAL(15, 2);
    SELECT @SaldoAtual = creditos_saldo
    FROM [dbo].[client_credits]
    WHERE [client_id] = @ClientId;

    IF @SaldoAtual IS NULL OR @SaldoAtual < @CreditosAConsumir
    BEGIN
        ROLLBACK TRANSACTION;
        THROW 50001, 'Saldo de créditos insuficiente', 1;
    END

    -- Registrar consumo
    INSERT INTO [dbo].[credit_transactions]
        ([client_id], [execution_id], [tipo], [creditos_alterados],
         [saldo_anterior], [saldo_novo], [descricao])
    VALUES
        (@ClientId, @ExecutionId, 'consumption', -@CreditosAConsumir,
         @SaldoAtual, @SaldoAtual - @CreditosAConsumir, @DescricaoConsumo);

    -- Atualizar saldo
    UPDATE [dbo].[client_credits]
    SET
        [creditos_saldo] = [creditos_saldo] - @CreditosAConsumir,
        [creditos_consumidos_mes] = [creditos_consumidos_mes] + @CreditosAConsumir,
        [atualizado_em] = GETUTCDATE()
    WHERE [client_id] = @ClientId;

    -- Atualizar execution com créditos utilizados
    UPDATE [dbo].[executions]
    SET [creditos_utilizados] = @CreditosAConsumir
    WHERE [id] = @ExecutionId;

    COMMIT TRANSACTION;

    SELECT @SaldoAtual - @CreditosAConsumir as [novo_saldo];
END;

-- Procedure: Renovar Créditos Mensais
CREATE PROCEDURE [dbo].[sp_RenewMonthlyCredits]
    @ClientId UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @PlanId UNIQUEIDENTIFIER;
    DECLARE @CreditosInclusos DECIMAL(15, 2);

    SELECT @PlanId = [plan_id], @CreditosInclusos = p.[creditos_inclusos]
    FROM [dbo].[client_credits] cc
    JOIN [dbo].[credit_plans] p ON cc.[plan_id] = p.[id]
    WHERE cc.[client_id] = @ClientId AND cc.[ativo] = 1;

    IF @PlanId IS NOT NULL
    BEGIN
        UPDATE [dbo].[client_credits]
        SET
            [creditos_saldo] = @CreditosInclusos,
            [creditos_consumidos_mes] = 0,
            [data_renovacao_creditos] = DATEADD(MONTH, 1, GETUTCDATE()),
            [atualizado_em] = GETUTCDATE()
        WHERE [client_id] = @ClientId;

        -- Registrar transação de renovação
        INSERT INTO [dbo].[credit_transactions]
            ([client_id], [tipo], [creditos_alterados], [saldo_anterior],
             [saldo_novo], [descricao])
        VALUES
            (@ClientId, 'renewal', @CreditosInclusos, 0, @CreditosInclusos,
             'Renovação mensal de créditos do plano');
    END
END;

-- Procedure: Gerar Fatura Mensal
CREATE PROCEDURE [dbo].[sp_GenerateMonthlyInvoice]
    @ClientId UNIQUEIDENTIFIER,
    @MesReferencia VARCHAR(7) -- YYYY-MM
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @CreditosConsumidos DECIMAL(15, 2);
    DECLARE @CreditosInclusos DECIMAL(15, 2);
    DECLARE @ValorUnitarioCom DECIMAL(10, 4);
    DECLARE @ValorBaseExtra DECIMAL(10, 2);
    DECLARE @ValorPlano DECIMAL(10, 2);
    DECLARE @CreditosExcedentes DECIMAL(15, 2);
    DECLARE @ValorTotal DECIMAL(10, 2);
    DECLARE @NumeroNF NVARCHAR(50);

    -- Obter dados de consumo
    SELECT
        @CreditosConsumidos = SUM(COALESCE(creditos_utilizados, 0)),
        @CreditosInclusos = p.creditos_inclusos,
        @ValorPlano = p.valor_mensal_brl,
        @ValorUnitarioCom = p.valor_credito_excedente_brl
    FROM [dbo].[executions] e
    LEFT JOIN [dbo].[client_credits] cc ON e.[client_id] = cc.[client_id]
    LEFT JOIN [dbo].[credit_plans] p ON cc.[plan_id] = p.[id]
    WHERE e.[client_id] = @ClientId
        AND YEAR(e.[finalizado_em]) = YEAR(GETDATE())
        AND MONTH(e.[finalizado_em]) = MONTH(GETDATE())
    GROUP BY p.creditos_inclusos, p.valor_mensal_brl, p.valor_credito_excedente_brl;

    -- Calcular excedentes
    SET @CreditosExcedentes = CASE
        WHEN @CreditosConsumidos > @CreditosInclusos
        THEN @CreditosConsumidos - @CreditosInclusos
        ELSE 0
    END;

    SET @ValorBaseExtra = @CreditosExcedentes * @ValorUnitarioCom;
    SET @ValorTotal = @ValorPlano + @ValorBaseExtra;

    -- Gerar número NF
    SET @NumeroNF = @MesReferencia + '-' + FORMAT(@ClientId, 'N', 'pt-BR') + '-' +
                    FORMAT(EOMONTH(CAST(@MesReferencia + '-01' AS DATE)), 'yyyyMMdd');

    -- Inserir fatura
    INSERT INTO [dbo].[faturas]
        ([client_id], [numero_nf], [mes_referencia], [creditos_consumidos],
         [creditos_inclusos_plano], [creditos_excedentes], [valor_base_plano],
         [valor_excedentes], [valor_total_brl], [status])
    VALUES
        (@ClientId, @NumeroNF, @MesReferencia, @CreditosConsumidos,
         @CreditosInclusos, @CreditosExcedentes, @ValorPlano,
         @ValorBaseExtra, @ValorTotal, 'draft');

    SELECT @NumeroNF as [numero_nf], @ValorTotal as [valor_total];
END;

-- Procedure: Criar Convite de Usuário
CREATE PROCEDURE [dbo].[sp_CreateUserInvite]
    @ClientId UNIQUEIDENTIFIER,
    @Email NVARCHAR(255),
    @Papel VARCHAR(20),
    @CriadoPor UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @Token NVARCHAR(255) = SUBSTRING(CONVERT(VARCHAR(MAX), NEWID()), 1, 32) +
                                   SUBSTRING(CONVERT(VARCHAR(MAX), NEWID()), 1, 32);
    DECLARE @ExpiresIn DATETIME2 = DATEADD(DAY, 7, GETUTCDATE());

    INSERT INTO [dbo].[user_invites]
        ([id], [client_id], [email], [papel], [token], [status], [criado_por], [expira_em])
    VALUES
        (NEWID(), @ClientId, @Email, @Papel, @Token, 'pending', @CriadoPor, @ExpiresIn);

    SELECT @Token as [token], @ExpiresIn as [expires_at];
END;
