#!/usr/bin/env ts-node

import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import * as fs from "fs";
import { MIGRATION_ALIASES } from "./migration-aliases";

dotenv.config();

const dataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "driver_user",
  password: process.env.DB_PASSWORD || "driver_password",
  database: process.env.DB_NAME || "driver_service",
  entities: ["src/**/*.entity.ts"],
  migrations: ["src/migrations/*.ts"],
  migrationsTableName: "_migrations",
  migrationsTransactionMode: "each",
  synchronize: false,
  logging: false,
});

// Critical tables that must exist
const REQUIRED_TABLES = [
  "outbox",
  "driver_offers",
  "deliveries",
  "drivers",
  "admin_users",
  "cities",
  "zones",
  "audit_logs",
];

// Critical indexes that must exist
const REQUIRED_INDEXES = [
  "idx_delivery_pending",
  "idx_driver_pending",
  "idx_expires_at",
  "idx_delivery_active_driver",
  "idx_outbox_worker",
];

// Critical constraints that must exist
const REQUIRED_CONSTRAINTS: string[] = [];

const REQUIRED_FOREIGN_KEYS = [
  {
    sourceTable: "delivery_events",
    sourceColumn: "delivery_id",
    targetTable: "deliveries",
    targetColumn: "id",
  },
  {
    sourceTable: "admin_users",
    sourceColumn: "city_id",
    targetTable: "cities",
    targetColumn: "id",
  },
  {
    sourceTable: "zones",
    sourceColumn: "city_id",
    targetTable: "cities",
    targetColumn: "id",
  },
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasAppliedMigrationOrAlias(
  expectedMigrationName: string,
  appliedMigrationNames: Set<string>,
): boolean {
  if (appliedMigrationNames.has(expectedMigrationName)) {
    return true;
  }

  const aliases = MIGRATION_ALIASES[expectedMigrationName] ?? [];
  return aliases.some((alias) => appliedMigrationNames.has(alias));
}

async function verifyTables(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  for (const table of REQUIRED_TABLES) {
    const result = await queryRunner.query(
      `SELECT tablename FROM pg_tables WHERE tablename = $1`,
      [table],
    );

    if (result.length === 0) {
      errors.push(`❌ Missing required table: ${table}`);
    } else {
      console.log(`✅ Table exists: ${table}`);
    }
  }

  await queryRunner.release();
  return errors;
}

async function verifyIndexes(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  for (const index of REQUIRED_INDEXES) {
    const result = await queryRunner.query(
      `SELECT indexname FROM pg_indexes WHERE indexname = $1`,
      [index],
    );

    if (result.length === 0) {
      errors.push(`❌ Missing required index: ${index}`);
    } else {
      console.log(`✅ Index exists: ${index}`);
    }
  }

  await queryRunner.release();
  return errors;
}

async function verifyConstraints(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  for (const constraint of REQUIRED_CONSTRAINTS) {
    const result = await queryRunner.query(
      `SELECT conname FROM pg_constraint WHERE conname = $1`,
      [constraint],
    );

    if (result.length === 0) {
      errors.push(`❌ Missing required constraint: ${constraint}`);
    } else {
      console.log(`✅ Constraint exists: ${constraint}`);
    }
  }

  await queryRunner.release();
  return errors;
}

async function verifyForeignKeys(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  for (const fk of REQUIRED_FOREIGN_KEYS) {
    const result = await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_name = $1
          AND kcu.column_name = $2
          AND ccu.table_name = $3
          AND ccu.column_name = $4
        LIMIT 1
      `,
      [fk.sourceTable, fk.sourceColumn, fk.targetTable, fk.targetColumn],
    );

    if (result.length === 0) {
      errors.push(
        `❌ Missing foreign key: ${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetTable}.${fk.targetColumn}`,
      );
    } else {
      console.log(
        `✅ Foreign key exists: ${fk.sourceTable}.${fk.sourceColumn} -> ${fk.targetTable}.${fk.targetColumn}`,
      );
    }
  }

  await queryRunner.release();
  return errors;
}

async function verifyOutboxTable(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  // Check outbox table structure
  const outboxColumns = await queryRunner.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'outbox'
    ORDER BY ordinal_position
  `);

  const requiredColumns = [
    { name: "id", type: "integer", nullable: "NO" },
    { name: "event_type", type: "character varying", nullable: "NO" },
    { name: "payload", type: "jsonb", nullable: "NO" },
    { name: "status", type: "character varying", nullable: "NO" },
    { name: "retry_count", type: "integer", nullable: "NO" },
    { name: "last_error", type: "text", nullable: "YES" },
    {
      name: "next_retry_at",
      type: "timestamp without time zone",
      nullable: "YES",
    },
    { name: "locked_at", type: "timestamp without time zone", nullable: "YES" },
    { name: "locked_by", type: "character varying", nullable: "YES" },
    { name: "created_at", type: "timestamp without time zone", nullable: "NO" },
  ];

  for (const required of requiredColumns) {
    const found = outboxColumns.find(
      (col: any) => col.column_name === required.name,
    );
    if (!found) {
      errors.push(`❌ Missing required column in outbox: ${required.name}`);
    } else {
      console.log(
        `✅ Outbox column exists: ${required.name} (${found.data_type})`,
      );
    }
  }

  await queryRunner.release();
  return errors;
}

async function verifyMigrationStatus(): Promise<string[]> {
  const errors: string[] = [];

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  // Check if all migrations have been applied
  const appliedMigrations = (await queryRunner.query(
    `SELECT name FROM _migrations ORDER BY id`,
  )) as Array<{ name?: unknown }>;
  const appliedMigrationNames = new Set(
    appliedMigrations
      .map((m) => m.name)
      .filter((name: unknown): name is string => isNonEmptyString(name)),
  );

  const migrationFiles = await import("glob").then((g) =>
    g.glob("src/migrations/*.ts", { cwd: process.cwd() }),
  );

  // Extract migration class names from files (what TypeORM actually stores)
  const expectedMigrations = migrationFiles
    .map((file) => {
      const content = fs.readFileSync(file, "utf8");
      const match = content.match(/export class (\w+)/);
      return match ? match[1] : null;
    })
    .filter((name): name is string => isNonEmptyString(name));

  const missingMigrations = expectedMigrations.filter(
    (name) => !hasAppliedMigrationOrAlias(name, appliedMigrationNames),
  );

  if (missingMigrations.length > 0) {
    errors.push(
      `❌ Missing applied migrations: ${missingMigrations.join(", ")}`,
    );
  } else {
    console.log(
      `✅ All migrations applied (${appliedMigrations.length} total)`,
    );
  }

  await queryRunner.release();
  return errors;
}

async function main() {
  console.log("🔍 Verifying database schema...\n");

  await dataSource.initialize();

  const allErrors: string[] = [];

  allErrors.push(...(await verifyTables()));
  allErrors.push(...(await verifyIndexes()));
  allErrors.push(...(await verifyConstraints()));
  allErrors.push(...(await verifyForeignKeys()));
  allErrors.push(...(await verifyOutboxTable()));
  allErrors.push(...(await verifyMigrationStatus()));

  await dataSource.destroy();

  if (allErrors.length > 0) {
    console.log("\n❌ Database verification failed:");
    allErrors.forEach((error) => console.log(`  ${error}`));
    process.exit(1);
  } else {
    console.log("\n✅ Database verification passed");
  }
}

if (require.main === module) {
  main().catch(console.error);
}
