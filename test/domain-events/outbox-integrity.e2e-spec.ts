import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { getDataSourceToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { AppModule } from "../../src/app.module";
import { OutboxStatus } from "../../src/domain-events/outbox-status.enum";

describe("Outbox Integrity (e2e)", () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(getDataSourceToken());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean outbox table
    await dataSource.query("DELETE FROM outbox");
  });

  describe("Malformed Row Handling", () => {
    it("should quarantine rows with NULL event_type", async () => {
      // Insert corrupted row directly
      await dataSource.query(
        `INSERT INTO outbox (event_type, payload, status, retry_count) 
         VALUES (NULL, '{"test": true}', 'PENDING', 0)`
      );

      // Wait for worker to process (cron runs every 5s)
      await new Promise((resolve) => setTimeout(resolve, 6000));

      // Verify row is now FAILED
      const result = await dataSource.query(
        `SELECT status, retry_count, last_error FROM outbox WHERE event_type IS NULL`
      );

      expect(result[0].status).toBe("FAILED");
      expect(result[0].retry_count).toBe(10); // MAX_RETRIES
      expect(result[0].last_error).toContain("NULL_EVENT_TYPE");
    });

    it("should process valid rows correctly", async () => {
      await dataSource.query(
        `INSERT INTO outbox (event_type, payload, status, retry_count) 
         VALUES ('DELIVERY_ASSIGNED', '{"driverId": "driver-123"}', 'PENDING', 0)`
      );

      await new Promise((resolve) => setTimeout(resolve, 6000));

      const result = await dataSource.query(
        `SELECT status FROM outbox WHERE event_type = 'DELIVERY_ASSIGNED'`
      );

      expect(result[0].status).toBe("COMPLETED");
    });

    it("should quarantine rows with empty string event_type", async () => {
      await dataSource.query(
        `INSERT INTO outbox (event_type, payload, status, retry_count) 
         VALUES ('', '{"test": true}', 'PENDING', 0)`
      );

      await new Promise((resolve) => setTimeout(resolve, 6000));

      const result = await dataSource.query(
        `SELECT status FROM outbox WHERE event_type = ''`
      );

      expect(result[0].status).toBe("FAILED");
    });
  });

  describe("Column Mapping", () => {
    it("should correctly map snake_case columns from RETURNING *", async () => {
      const insertResult = await dataSource.query(
        `INSERT INTO outbox (event_type, payload, status, retry_count) 
         VALUES ('DELIVERY_ASSIGNED', '{}', 'PENDING', 5)
         RETURNING *`
      );

      const row = insertResult[0];
      
      // Verify snake_case in raw result
      expect(row).toHaveProperty("event_type");
      expect(row).toHaveProperty("retry_count");
      expect(row.event_type).toBe("DELIVERY_ASSIGNED");
      expect(row.retry_count).toBe(5);
    });
  });
});
