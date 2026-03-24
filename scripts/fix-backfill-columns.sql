-- Fix BackfillJob table column names to match TypeORM snake_case naming strategy
-- This script renames columns from camelCase to snake_case

BEGIN;

-- Rename columns from camelCase to snake_case
ALTER TABLE backfill_jobs RENAME COLUMN "tableName" TO table_name;
ALTER TABLE backfill_jobs RENAME COLUMN "migrationName" TO migration_name;
ALTER TABLE backfill_jobs RENAME COLUMN "sqlStatement" TO sql_statement;
ALTER TABLE backfill_jobs RENAME COLUMN "totalRows" TO total_rows;
ALTER TABLE backfill_jobs RENAME COLUMN "processedRows" TO processed_rows;
ALTER TABLE backfill_jobs RENAME COLUMN "lastProcessedId" TO last_processed_id;
ALTER TABLE backfill_jobs RENAME COLUMN "retryCount" TO retry_count;
ALTER TABLE backfill_jobs RENAME COLUMN "maxRetries" TO max_retries;
ALTER TABLE backfill_jobs RENAME COLUMN "errorMessage" TO error_message;
ALTER TABLE backfill_jobs RENAME COLUMN "startedAt" TO started_at;
ALTER TABLE backfill_jobs RENAME COLUMN "completedAt" TO completed_at;
ALTER TABLE backfill_jobs RENAME COLUMN "createdAt" TO created_at;
ALTER TABLE backfill_jobs RENAME COLUMN "updatedAt" TO updated_at;

COMMIT;