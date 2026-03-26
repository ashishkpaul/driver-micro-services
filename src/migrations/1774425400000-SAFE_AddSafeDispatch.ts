import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class AddSafeDispatch1774425400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('dispatch_decisions');
    if (tableExists) {
      console.log('dispatch_decisions table already exists, skipping creation');
      return;
    }

    // Create dispatch_decisions table
    await queryRunner.createTable(
      new Table({
        name: "dispatch_decisions",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "delivery_id",
            type: "uuid",
            isNullable: false,
          },
          {
            name: "driver_id",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "cohort",
            type: "enum",
            enum: ["CONTROL", "SCORING", "MANUAL"],
            isNullable: false,
          },
          {
            name: "dispatch_method",
            type: "enum",
            enum: ["LEGACY", "SCORING_BASED", "MANUAL_OVERRIDE"],
            isNullable: false,
          },
          {
            name: "dispatch_status",
            type: "enum",
            enum: ["PENDING", "ASSIGNED", "FAILED", "TIMEOUT"],
            isNullable: false,
          },
          {
            name: "score_used",
            type: "decimal",
            precision: 5,
            scale: 2,
            isNullable: true,
          },
          {
            name: "fallback_reason",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "processing_time_ms",
            type: "integer",
            isNullable: true,
          },
          {
            name: "driver_acceptance_rate",
            type: "decimal",
            precision: 5,
            scale: 2,
            isNullable: true,
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
            columnNames: ["delivery_id"],
            referencedTableName: "deliveries",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
          {
            columnNames: ["driver_id"],
            referencedTableName: "drivers",
            referencedColumnNames: ["id"],
            onDelete: "SET NULL",
          },
        ],
      }),
      true,
    );

    // Create indexes for dispatch_decisions with idempotency
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_delivery_id ON dispatch_decisions(delivery_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_driver_id ON dispatch_decisions(driver_id);
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_cohort ON dispatch_decisions(cohort);
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_method ON dispatch_decisions(dispatch_method);
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_status ON dispatch_decisions(dispatch_status);
      CREATE INDEX IF NOT EXISTS idx_dispatch_decisions_created_at ON dispatch_decisions(created_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists before dropping
    const tableExists = await queryRunner.hasTable('dispatch_decisions');
    if (!tableExists) {
      console.log('dispatch_decisions table does not exist, skipping drop');
      return;
    }

    // Drop indexes first with idempotency
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_dispatch_decisions_delivery_id;
      DROP INDEX IF EXISTS idx_dispatch_decisions_driver_id;
      DROP INDEX IF EXISTS idx_dispatch_decisions_cohort;
      DROP INDEX IF EXISTS idx_dispatch_decisions_method;
      DROP INDEX IF EXISTS idx_dispatch_decisions_status;
      DROP INDEX IF EXISTS idx_dispatch_decisions_created_at;
    `);

    await queryRunner.dropTable("dispatch_decisions", true);
  }
}