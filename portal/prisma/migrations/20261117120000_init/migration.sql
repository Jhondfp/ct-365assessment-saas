BEGIN TRY

BEGIN TRAN;

-- CreateSchema
IF NOT EXISTS (SELECT * FROM sys.schemas WHERE name = N'dbo') EXEC sp_executesql N'CREATE SCHEMA [dbo];';

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000),
    [email] NVARCHAR(1000) NOT NULL,
    [entraOid] NVARCHAR(1000),
    [entraTenantId] NVARCHAR(1000),
    [active] BIT NOT NULL CONSTRAINT [User_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [lastLoginAt] DATETIME2,
    [passwordHash] NVARCHAR(1000),
    [mustChangePassword] BIT NOT NULL CONSTRAINT [User_mustChangePassword_df] DEFAULT 0,
    [passwordChangedAt] DATETIME2,
    [failedLogins] INT NOT NULL CONSTRAINT [User_failedLogins_df] DEFAULT 0,
    [lockedUntil] DATETIME2,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

-- CreateTable
CREATE TABLE [dbo].[UserRole] (
    [userId] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [UserRole_pkey] PRIMARY KEY CLUSTERED ([userId],[role])
);

-- CreateTable
CREATE TABLE [dbo].[UserClient] (
    [userId] NVARCHAR(1000) NOT NULL,
    [clientId] NVARCHAR(1000) NOT NULL,
    CONSTRAINT [UserClient_pkey] PRIMARY KEY CLUSTERED ([userId],[clientId])
);

-- CreateTable
CREATE TABLE [dbo].[Client] (
    [id] NVARCHAR(1000) NOT NULL,
    [name] NVARCHAR(1000) NOT NULL,
    [slug] NVARCHAR(1000) NOT NULL,
    [document] NVARCHAR(1000),
    [notes] NVARCHAR(max),
    [active] BIT NOT NULL CONSTRAINT [Client_active_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Client_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [m365TenantId] NVARCHAR(1000),
    [spoTenant] NVARCHAR(1000),
    [appClientId] NVARCHAR(1000),
    [authMode] NVARCHAR(1000) NOT NULL CONSTRAINT [Client_authMode_df] DEFAULT 'secret',
    [credentialSetAt] DATETIME2,
    [credentialHint] NVARCHAR(1000),
    [connectionOkAt] DATETIME2,
    [connectionError] NVARCHAR(max),
    [dbName] NVARCHAR(1000),
    [dbStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Client_dbStatus_df] DEFAULT 'PENDENTE',
    [dbSchemaVersion] INT NOT NULL CONSTRAINT [Client_dbSchemaVersion_df] DEFAULT 0,
    [dbError] NVARCHAR(max),
    CONSTRAINT [Client_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Client_slug_key] UNIQUE NONCLUSTERED ([slug])
);

-- CreateTable
CREATE TABLE [dbo].[Assessment] (
    [id] NVARCHAR(1000) NOT NULL,
    [clientId] NVARCHAR(1000) NOT NULL,
    [startedById] NVARCHAR(1000),
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [Assessment_status_df] DEFAULT 'QUEUED',
    [params] NVARCHAR(max) NOT NULL,
    [runner] NVARCHAR(1000) NOT NULL,
    [runnerRef] NVARCHAR(1000),
    [attempts] INT NOT NULL CONSTRAINT [Assessment_attempts_df] DEFAULT 0,
    [progress] NVARCHAR(max),
    [logTail] NVARCHAR(max),
    [error] NVARCHAR(max),
    [totalSites] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Assessment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [startedAt] DATETIME2,
    [finishedAt] DATETIME2,
    [heartbeatAt] DATETIME2,
    CONSTRAINT [Assessment_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[StoredSecret] (
    [name] NVARCHAR(1000) NOT NULL,
    [value] NVARCHAR(max) NOT NULL,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [StoredSecret_pkey] PRIMARY KEY CLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] NVARCHAR(1000) NOT NULL,
    [entity] NVARCHAR(1000) NOT NULL,
    [entityId] NVARCHAR(1000) NOT NULL,
    [action] NVARCHAR(1000) NOT NULL,
    [changes] NVARCHAR(max),
    [userId] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserRole_role_idx] ON [dbo].[UserRole]([role]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [UserClient_clientId_idx] ON [dbo].[UserClient]([clientId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Assessment_clientId_createdAt_idx] ON [dbo].[Assessment]([clientId], [createdAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Assessment_status_idx] ON [dbo].[Assessment]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entity_entityId_idx] ON [dbo].[AuditLog]([entity], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_createdAt_idx] ON [dbo].[AuditLog]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[UserRole] ADD CONSTRAINT [UserRole_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UserClient] ADD CONSTRAINT [UserClient_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UserClient] ADD CONSTRAINT [UserClient_clientId_fkey] FOREIGN KEY ([clientId]) REFERENCES [dbo].[Client]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Assessment] ADD CONSTRAINT [Assessment_clientId_fkey] FOREIGN KEY ([clientId]) REFERENCES [dbo].[Client]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Assessment] ADD CONSTRAINT [Assessment_startedById_fkey] FOREIGN KEY ([startedById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

