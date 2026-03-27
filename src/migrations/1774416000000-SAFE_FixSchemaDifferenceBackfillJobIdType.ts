import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFE_FIX_SCHEMA_DIFFERENCE_BACKFILL_JOB_ID_TYPE1774416000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix the backfill_job_id column type from varchar to uuid in schema_differences table
    // SAFE: Only executes if table and column exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'schema_differences'
          AND column_name = 'backfill_job_id'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN backfill_job_id TYPE UUID 
          USING backfill_job_id::UUID;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the column type back to varchar (for development/testing only)
    // SAFE: Only executes if table and column exist
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_name = 'schema_differences'
        ) AND EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'schema_differences'
          AND column_name = 'backfill_job_id'
        ) THEN
          ALTER TABLE schema_differences 
          ALTER COLUMN backfill_job_id TYPE VARCHAR;
        END IF;
      END $$;
    `);
  }
}
