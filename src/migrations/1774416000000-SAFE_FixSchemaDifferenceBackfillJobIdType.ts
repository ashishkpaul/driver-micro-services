import { MigrationInterface, QueryRunner } from 'typeorm';

export class SAFE_FIX_SCHEMA_DIFFERENCE_BACKFILL_JOB_ID_TYPE1774416000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix the backfill_job_id column type from varchar to uuid in schema_differences table
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN backfill_job_id TYPE UUID 
      USING backfill_job_id::UUID
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the column type back to varchar (for development/testing only)
    await queryRunner.query(`
      ALTER TABLE schema_differences 
      ALTER COLUMN backfill_job_id TYPE VARCHAR
    `);
  }
}