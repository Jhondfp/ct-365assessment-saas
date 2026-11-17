BEGIN TRY

BEGIN TRAN;

-- AlterTable
ALTER TABLE [dbo].[Assessment] ADD [kind] NVARCHAR(1000) NOT NULL CONSTRAINT [Assessment_kind_df] DEFAULT 'COLETA',
[workloads] NVARCHAR(max),
[preflight] NVARCHAR(max);

-- CreateTable
CREATE TABLE [dbo].[AssessmentLog] (
    [assessmentId] NVARCHAR(1000) NOT NULL,
    [content] VARBINARY(max) NOT NULL,
    [size] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AssessmentLog_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AssessmentLog_pkey] PRIMARY KEY CLUSTERED ([assessmentId])
);

-- AddForeignKey
ALTER TABLE [dbo].[AssessmentLog] ADD CONSTRAINT [AssessmentLog_assessmentId_fkey] FOREIGN KEY ([assessmentId]) REFERENCES [dbo].[Assessment]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
