import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Stub to satisfy drift check — this migration was applied to the DB
 *            under the name REPAIRRegistrationStatusColumnName1774800000001.
 *            The actual logic lives in 1774800000001-FIX_RegistrationStatusColumnName.ts.
 * TYPE:      FIX
 * RISK:      LOW
 * ROLLBACK:  SAFE
 */
// @allow-mixed-ops: stub only — no SQL executed

export class REPAIRRegistrationStatusColumnName1774800000001
  implements MigrationInterface
{
  name = "REPAIRRegistrationStatusColumnName1774800000001";

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // Already applied — no-op stub
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    throw new Error("Stub migration — no rollback needed");
  }
}
