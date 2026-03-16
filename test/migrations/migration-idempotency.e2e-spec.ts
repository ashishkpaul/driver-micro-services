import "dotenv/config";
import { createHash } from "crypto";
import dataSource from "../../src/config/data-source";

type SchemaRow = {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
};

type IndexRow = {
  indexname: string;
  indexdef: string;
};

async function schemaFingerprint(): Promise<string> {
  const columns = (await dataSource.query(`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `)) as SchemaRow[];

  const indexes = (await dataSource.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `)) as IndexRow[];

  return createHash("sha256")
    .update(JSON.stringify({ columns, indexes }))
    .digest("hex");
}

describe("Migration idempotency", () => {
  beforeAll(async () => {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it("applies migrations idempotently on repeated runs", async () => {
    await dataSource.runMigrations({ transaction: "each" });

    const beforeHash = await schemaFingerprint();
    const secondRun = await dataSource.runMigrations({ transaction: "each" });
    const afterHash = await schemaFingerprint();

    expect(secondRun).toHaveLength(0);
    expect(afterHash).toEqual(beforeHash);
  });
});
