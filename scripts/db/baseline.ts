import * as fs from "fs";
import * as path from "path";

export function ensureBaselineExists() {
  const migrationsDir = path.resolve(process.cwd(), "src/migrations");

  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, {
      recursive: true,
    });
  }

  const files = fs.readdirSync(migrationsDir);

  const hasBaseline = files.some((f) => f.includes("BASELINE_"));

  if (hasBaseline) return;

  console.log("Fresh project detected → generating baseline");

  const timestamp = "0000000000000";

  const fileName = `${timestamp}-BASELINE_Initial.ts`;

  const template = `
import { MigrationInterface, QueryRunner }
from "typeorm";

/**
 * INTENT: Initial baseline migration
 * TYPE: BASELINE
 * RISK: LOW
 * ROLLBACK: SAFE
 *
 * Generated automatically.
 */

// @allow-mixed-ops: baseline
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE

export class Baseline${timestamp}
implements MigrationInterface {

public async up(
queryRunner: QueryRunner
): Promise<void> {
  // TypeORM automatically creates the migration metadata table.
  // We leave this empty or perform a dummy query to ensure it's a valid migration.
  await queryRunner.query(\`SELECT 1\`);
}

public async down(
queryRunner: QueryRunner
): Promise<void> {
  // Do nothing - TypeORM manages the migration table
}

}
`;

  fs.writeFileSync(path.join(migrationsDir, fileName), template);

  console.log("Baseline created");
}
