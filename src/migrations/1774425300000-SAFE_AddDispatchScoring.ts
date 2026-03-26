import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class AddDispatchScoring1774425300000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types first
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE dispatch_scores_score_type_enum AS ENUM ('OVERALL', 'COMPLETION_RATE', 'TIMING', 'QUALITY');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE dispatch_scores_score_source_enum AS ENUM ('DRIVER_STATS', 'DELIVERY_METRICS', 'MANUAL_ADJUSTMENT');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE dispatch_configs_config_type_enum AS ENUM ('SCORING_WEIGHTS', 'THRESHOLDS', 'DECAY_SETTINGS', 'ROLLOUT_SETTINGS');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE dispatch_configs_config_scope_enum AS ENUM ('GLOBAL', 'REGION', 'DRIVER_TYPE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Check if tables already exist
    const dispatchScoresExists = await queryRunner.hasTable('dispatch_scores');
    const dispatchConfigsExists = await queryRunner.hasTable('dispatch_configs');
    
    if (dispatchScoresExists && dispatchConfigsExists) {
      console.log('dispatch_scores and dispatch_configs tables already exist, skipping creation');
      return;
    }

    if (!dispatchScoresExists) {
      // Create dispatch_scores table
      await queryRunner.createTable(
        new Table({
          name: "dispatch_scores",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "driver_id",
              type: "uuid",
              isNullable: false,
            },
            {
              name: "score_type",
              type: "dispatch_scores_score_type_enum",
              isNullable: false,
            },
            {
              name: "score",
              type: "decimal",
              precision: 5,
              scale: 2,
              isNullable: false,
            },
            {
              name: "score_source",
              type: "dispatch_scores_score_source_enum",
              isNullable: false,
            },
            {
              name: "weight_factor",
              type: "decimal",
              precision: 3,
              scale: 2,
              default: 1.0,
              isNullable: false,
            },
            {
              name: "decay_factor",
              type: "decimal",
              precision: 3,
              scale: 2,
              default: 1.0,
              isNullable: false,
            },
            {
              name: "last_calculated_at",
              type: "timestamp",
              isNullable: false,
            },
            {
              name: "valid_until",
              type: "timestamp",
              isNullable: false,
            },
            {
              name: "metadata",
              type: "jsonb",
              isNullable: true,
            },
            {
              name: "created_at",
              type: "timestamp",
              default: "NOW()",
            },
            {
              name: "updated_at",
              type: "timestamp",
              default: "NOW()",
              onUpdate: "NOW()",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["driver_id"],
              referencedTableName: "drivers",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );

      // Create indexes for dispatch_scores with idempotency
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_scores_driver_id ON dispatch_scores(driver_id);
        CREATE INDEX IF NOT EXISTS idx_dispatch_scores_type ON dispatch_scores(score_type);
        CREATE INDEX IF NOT EXISTS idx_dispatch_scores_driver_type ON dispatch_scores(driver_id, score_type);
        CREATE INDEX IF NOT EXISTS idx_dispatch_scores_created_at ON dispatch_scores(created_at);
      `);
    }

    if (!dispatchConfigsExists) {
      // Create dispatch_configs table
      await queryRunner.createTable(
        new Table({
          name: "dispatch_configs",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "config_type",
              type: "dispatch_configs_config_type_enum",
              isNullable: false,
            },
            {
              name: "config_scope",
              type: "dispatch_configs_config_scope_enum",
              isNullable: false,
            },
            {
              name: "scope_value",
              type: "varchar",
              isNullable: true,
            },
            {
              name: "config_key",
              type: "varchar",
              isNullable: false,
            },
            {
              name: "config_value",
              type: "jsonb",
              isNullable: false,
            },
            {
              name: "is_active",
              type: "boolean",
              default: true,
              isNullable: false,
            },
            {
              name: "version",
              type: "integer",
              default: 1,
              isNullable: false,
            },
            {
              name: "description",
              type: "text",
              isNullable: true,
            },
            {
              name: "created_at",
              type: "timestamp",
              default: "NOW()",
            },
            {
              name: "updated_at",
              type: "timestamp",
              default: "NOW()",
              onUpdate: "NOW()",
            },
          ],
        }),
        true,
      );

      // Create indexes for dispatch_configs with idempotency
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS idx_dispatch_configs_type ON dispatch_configs(config_type);
        CREATE INDEX IF NOT EXISTS idx_dispatch_configs_scope ON dispatch_configs(config_scope);
        CREATE INDEX IF NOT EXISTS idx_dispatch_configs_type_scope ON dispatch_configs(config_type, config_scope);
      `);
    }

    // Insert default configuration values (only if table was created)
    if (!dispatchConfigsExists) {
      await queryRunner.query(`
        INSERT INTO dispatch_configs (config_type, config_scope, config_key, config_value, description)
        VALUES
          ('SCORING_WEIGHTS', 'GLOBAL', 'weights', '{"completionRate": 0.4, "timing": 0.3, "quality": 0.3}', 'Default scoring weights'),
          ('THRESHOLDS', 'GLOBAL', 'thresholds', '{"minimumScore": 50, "minimumAssignments": 5}', 'Default scoring thresholds'),
          ('DECAY_SETTINGS', 'GLOBAL', 'decay', '{"baseDecay": 0.95, "maxDecayDays": 30}', 'Default score decay settings'),
          ('ROLLOUT_SETTINGS', 'GLOBAL', 'rollout', '{"scoringEnabled": false, "rolloutPercentage": 0, "abTestGroups": {"control": 50, "scoring": 50}}', 'Default rollout settings')
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if tables exist before dropping
    const dispatchScoresExists = await queryRunner.hasTable('dispatch_scores');
    const dispatchConfigsExists = await queryRunner.hasTable('dispatch_configs');
    
    if (dispatchScoresExists) {
      // Drop indexes first with idempotency
      await queryRunner.query(`
        DROP INDEX IF EXISTS idx_dispatch_scores_driver_id;
        DROP INDEX IF EXISTS idx_dispatch_scores_type;
        DROP INDEX IF EXISTS idx_dispatch_scores_driver_type;
        DROP INDEX IF EXISTS idx_dispatch_scores_created_at;
      `);
      await queryRunner.dropTable("dispatch_scores", true);
    }
    
    if (dispatchConfigsExists) {
      // Drop indexes first with idempotency
      await queryRunner.query(`
        DROP INDEX IF EXISTS idx_dispatch_configs_type;
        DROP INDEX IF EXISTS idx_dispatch_configs_scope;
        DROP INDEX IF EXISTS idx_dispatch_configs_type_scope;
      `);
      await queryRunner.dropTable("dispatch_configs", true);
    }

    // Drop enum types with idempotency
    await queryRunner.query(`
      DROP TYPE IF EXISTS dispatch_scores_score_type_enum;
      DROP TYPE IF EXISTS dispatch_scores_score_source_enum;
      DROP TYPE IF EXISTS dispatch_configs_config_type_enum;
      DROP TYPE IF EXISTS dispatch_configs_config_scope_enum;
    `);
  }
}