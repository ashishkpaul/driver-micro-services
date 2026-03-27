import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFE_FIX_CRITICAL_SCHEMA_ALIGNMENT1774417018743 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // SAFE: Only execute if tables and columns exist

    // Fix HIGH severity: deliveries.seller_order_id UUID vs VARCHAR mismatch
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'deliveries'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' AND column_name = 'seller_order_id'
        ) THEN
          ALTER TABLE deliveries 
          ALTER COLUMN seller_order_id TYPE UUID 
          USING seller_order_id::UUID;
        END IF;
      END $$;
    `);

    // Fix HIGH severity: deliveries.seller_order_id nullable mismatch
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'deliveries'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' AND column_name = 'seller_order_id'
        ) THEN
          ALTER TABLE deliveries 
          ALTER COLUMN seller_order_id SET NOT NULL;
        END IF;
      END $$;
    `);

    // Fix MEDIUM severity: backfill_jobs nullable mismatches
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'processed_rows'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN processed_rows SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'last_processed_id'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN last_processed_id SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'status'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN status SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'batch_size'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN batch_size SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'retry_count'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN retry_count SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'max_retries'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN max_retries SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'max_retries'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN max_retries SET DEFAULT 5;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN metadata SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN created_at SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN updated_at SET NOT NULL;
        END IF;
      END $$;
    `);

    // Fix MEDIUM severity: schema_differences nullable mismatches
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'readiness'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN readiness SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'validation_status'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN validation_status SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN metadata SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN created_at SET NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN updated_at SET NOT NULL;
        END IF;
      END $$;
    `);

    // Fix MEDIUM severity: outbox.updated_at default
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'outbox'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'outbox' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE outbox 
          ALTER COLUMN updated_at SET DEFAULT now();
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the changes (for development/testing only)
    // SAFE: Only execute if tables and columns exist

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'deliveries'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'deliveries' AND column_name = 'seller_order_id'
        ) THEN
          ALTER TABLE deliveries 
          ALTER COLUMN seller_order_id TYPE VARCHAR;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'processed_rows'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN processed_rows DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'last_processed_id'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN last_processed_id DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'status'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN status DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'batch_size'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN batch_size DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'retry_count'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN retry_count DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'max_retries'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN max_retries DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'max_retries'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN max_retries SET DEFAULT 3;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN metadata DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN created_at DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'backfill_jobs'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'backfill_jobs' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE backfill_jobs 
          ALTER COLUMN updated_at DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'readiness'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN readiness DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'validation_status'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN validation_status DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'metadata'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN metadata DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'created_at'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN created_at DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'schema_differences' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN updated_at DROP NOT NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables WHERE table_name = 'outbox'
        ) AND EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'outbox' AND column_name = 'updated_at'
        ) THEN
          ALTER TABLE outbox 
          ALTER COLUMN updated_at DROP DEFAULT;
        END IF;
      END $$;
    `);
  }
}
