import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFE_FIX_CRITICAL_SCHEMA_ALIGNMENT1774417018743 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix HIGH severity: deliveries.seller_order_id UUID vs VARCHAR mismatch
    await queryRunner.query(`
      ALTER TABLE deliveries 
      ALTER COLUMN seller_order_id TYPE UUID 
      USING seller_order_id::UUID
    `);

    // Fix HIGH severity: deliveries.seller_order_id nullable mismatch
    await queryRunner.query(`
      ALTER TABLE deliveries 
      ALTER COLUMN seller_order_id SET NOT NULL
    `);

    // Fix MEDIUM severity: backfill_jobs nullable mismatches
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN processed_rows SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN last_processed_id SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN status SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN batch_size SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN retry_count SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN max_retries SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN max_retries SET DEFAULT 5
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN metadata SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN created_at SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN updated_at SET NOT NULL
    `);

    // Fix MEDIUM severity: schema_differences nullable mismatches
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN readiness SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN validation_status SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN metadata SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN created_at SET NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN updated_at SET NOT NULL
    `);

    // Fix MEDIUM severity: outbox.updated_at default
    await queryRunner.query(`
      ALTER TABLE outbox 
      ALTER COLUMN updated_at SET DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the changes (for development/testing only)
    await queryRunner.query(`
      ALTER TABLE deliveries 
      ALTER COLUMN seller_order_id TYPE VARCHAR
    `);

    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN processed_rows DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN last_processed_id DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN status DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN batch_size DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN retry_count DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN max_retries DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN max_retries SET DEFAULT 3
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN metadata DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN created_at DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE backfill_jobs 
      ALTER COLUMN updated_at DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN readiness DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN validation_status DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN metadata DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN created_at DROP NOT NULL
    `);
    
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN updated_at DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE outbox 
      ALTER COLUMN updated_at DROP DEFAULT
    `);
  }
}