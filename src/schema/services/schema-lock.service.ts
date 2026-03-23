import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";

/**
 * Application-specific lock key — unique integer that identifies this project.
 * Must be consistent across all environments. Never reuse the same key for a
 * different application on the same Postgres instance.
 */
const ADVISORY_LOCK_KEY = 847291;

@Injectable()
export class SchemaLockService {
  private readonly logger = new Logger(SchemaLockService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Acquire advisory lock for schema operations
   * Uses pg_try_advisory_lock (non-blocking) so if another pod is migrating,
   * this pod knows to wait or skip rather than crashing.
   */
  async acquireLock(): Promise<boolean> {
    this.logger.log(`Attempting to acquire advisory lock (key: ${ADVISORY_LOCK_KEY})...`);

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Use pg_try_advisory_lock which returns boolean (non-blocking)
        const result = await queryRunner.query(
          "SELECT pg_try_advisory_lock($1) as acquired",
          [ADVISORY_LOCK_KEY]
        );

        const acquired = result[0]?.acquired;

        if (acquired) {
          this.logger.log(`✅ Advisory lock acquired successfully (key: ${ADVISORY_LOCK_KEY})`);
          return true;
        } else {
          this.logger.warn(`🔒 Advisory lock already held by another process (key: ${ADVISORY_LOCK_KEY})`);
          return false;
        }
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to acquire advisory lock", error);
      throw error;
    }
  }

  /**
   * Release advisory lock
   */
  async releaseLock(): Promise<void> {
    this.logger.log(`Releasing advisory lock (key: ${ADVISORY_LOCK_KEY})...`);

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        await queryRunner.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
        this.logger.log(`✅ Advisory lock released successfully (key: ${ADVISORY_LOCK_KEY})`);
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to release advisory lock", error);
      throw error;
    }
  }

  /**
   * Check if lock is currently held
   */
  async isLockHeld(): Promise<boolean> {
    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        const result = await queryRunner.query(
          "SELECT pg_advisory_unlock($1) as was_held",
          [ADVISORY_LOCK_KEY]
        );

        const wasHeld = result[0]?.was_held;

        // If it was held, re-acquire it
        if (wasHeld) {
          await queryRunner.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
        }

        return wasHeld;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to check lock status", error);
      throw error;
    }
  }

  /**
   * Execute operation with lock
   */
  async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const acquired = await this.acquireLock();
    
    if (!acquired) {
      throw new Error("Could not acquire schema lock - another migration is in progress");
    }

    try {
      const result = await operation();
      return result;
    } finally {
      await this.releaseLock();
    }
  }
}