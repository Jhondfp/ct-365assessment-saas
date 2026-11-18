BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[AssessmentTask] (
    [id] NVARCHAR(1000) NOT NULL,
    [assessmentId] NVARCHAR(1000) NOT NULL,
    [seq] INT NOT NULL,
    [sites] NVARCHAR(max) NOT NULL,
    [siteCount] INT NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [AssessmentTask_status_df] DEFAULT 'QUEUED',
    [attempts] INT NOT NULL CONSTRAINT [AssessmentTask_attempts_df] DEFAULT 0,
    [runnerRef] NVARCHAR(1000),
    [done] INT NOT NULL CONSTRAINT [AssessmentTask_done_df] DEFAULT 0,
    [error] NVARCHAR(max),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AssessmentTask_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [startedAt] DATETIME2,
    [finishedAt] DATETIME2,
    [heartbeatAt] DATETIME2,
    CONSTRAINT [AssessmentTask_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [AssessmentTask_assessmentId_seq_key] UNIQUE NONCLUSTERED ([assessmentId],[seq])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AssessmentTask_status_idx] ON [dbo].[AssessmentTask]([status]);

-- AddForeignKey
ALTER TABLE [dbo].[AssessmentTask] ADD CONSTRAINT [AssessmentTask_assessmentId_fkey] FOREIGN KEY ([assessmentId]) REFERENCES [dbo].[Assessment]([id]) ON DELETE CASCADE ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH

