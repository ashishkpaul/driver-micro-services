import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class SAFEAddBackfillJobTable1774400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use SQL-level idempotency check
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS backfill_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tableName" VARCHAR NOT NULL,
        "migrationName" VARCHAR NOT NULL,
        "sqlStatement" TEXT NOT NULL,
        "totalRows" INTEGER NOT NULL,
        "processedRows" INTEGER DEFAULT 0,
        "lastProcessedId" INTEGER DEFAULT 0,
        "status" VARCHAR DEFAULT 'PENDING',
        "retryCount" INTEGER DEFAULT 0,
        "maxRetries" INTEGER DEFAULT 3,
        "errorMessage" TEXT,
        "startedAt" TIMESTAMP,
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP DEFAULT NOW(),
        "updatedAt" TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes with idempotency
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_status ON backfill_jobs ("status")
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_table_name ON backfill_jobs ("tableName")
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_created_at ON backfill_jobs ("createdAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SAFE migrations are additive only and should not be rolled back in production
    // This method is intentionally empty to prevent data loss
    // IF EXISTS check: Table preservation for safety (no DROP operations)
    console.log('⚠️  SAFE migration rollback skipped: Table backfill_jobs preserved for safety');
  }
}