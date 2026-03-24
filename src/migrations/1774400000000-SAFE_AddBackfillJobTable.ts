import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class SAFEAddBackfillJobTable1774400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Use SQL-level idempotency check
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS backfill_jobs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        table_name VARCHAR NOT NULL,
        migration_name VARCHAR NOT NULL,
        sql_statement TEXT NOT NULL,
        total_rows INTEGER NOT NULL,
        processed_rows INTEGER DEFAULT 0,
        last_processed_id INTEGER DEFAULT 0,
        batch_size INTEGER DEFAULT 1000,
        status VARCHAR DEFAULT 'PENDING',
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        error_message TEXT,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        last_processed_at TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes with idempotency
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_status ON backfill_jobs (status)
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_table_name ON backfill_jobs (table_name)
    `);
    
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS IDX_backfill_jobs_created_at ON backfill_jobs (created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // SAFE migrations are additive only and should not be rolled back in production
    // This method is intentionally empty to prevent data loss
    // IF EXISTS check: Table preservation for safety (no DROP operations)
    console.log('⚠️  SAFE migration rollback skipped: Table backfill_jobs preserved for safety');
  }
}