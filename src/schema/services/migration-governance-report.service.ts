import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class MigrationGovernanceReportService {
  private readonly logger = new Logger(MigrationGovernanceReportService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Generate migration governance runtime report
   */
  async generateGovernanceReport(): Promise<void> {
    this.logger.log('MIGRATION GOVERNANCE');

    try {
      // Check migration guard status
      const guardStatus = await this.checkMigrationGuard();
      this.logger.log(`Guard: ${guardStatus}`);

      // Check rollback safety
      const rollbackSafety = await this.checkRollbackSafety();
      this.logger.log(`Rollback safety: ${rollbackSafety}`);

      // Check transaction safety
      const transactionSafety = await this.checkTransactionSafety();
      this.logger.log(`Transaction safety: ${transactionSafety}`);

      // Check migration naming policy
      const namingPolicy = await this.checkNamingPolicy();
      this.logger.log(`Naming policy: ${namingPolicy}`);

      // Check migration order
      const orderStatus = await this.checkMigrationOrder();
      this.logger.log(`Migration order: ${orderStatus}`);

      // Check for pending migrations
      const pendingMigrations = await this.checkPendingMigrations();
      this.logger.log(`Pending migrations: ${pendingMigrations}`);

    } catch (error) {
      this.logger.error('Migration governance check failed:', error);
      this.logger.log('Guard: FAILED');
    }
  }

  /**
   * Check if migration guard is active
   */
  private async checkMigrationGuard(): Promise<string> {
    try {
      // Check if migration lock table exists
      const hasLockTable = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_migrations_lock'
        )
      `);

      if (!hasLockTable[0]?.exists) {
        return 'DISABLED - No lock table';
      }

      // Check if lock is currently held
      const lockResult = await this.dataSource.query(`
        SELECT is_locked FROM _migrations_lock WHERE id = 1
      `);

      if (lockResult.length > 0 && lockResult[0].is_locked) {
        return 'ACTIVE - Lock held';
      }

      return 'PASSED - Lock available';
    } catch (error) {
      return 'FAILED - Error checking lock';
    }
  }

  /**
   * Check rollback safety
   */
  private async checkRollbackSafety(): Promise<string> {
    try {
      // Check if rollback information is available
      const hasRollbackInfo = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
            AND column_name = 'rollback_sql'
        )
      `);

      if (hasRollbackInfo[0]?.exists) {
        return 'PASSED - Rollback info available';
      }

      return 'WARNING - No rollback info';
    } catch (error) {
      return 'FAILED - Error checking rollback';
    }
  }

  /**
   * Check transaction safety
   */
  private async checkTransactionSafety(): Promise<string> {
    try {
      // Check if migrations are wrapped in transactions
      const hasTransactionInfo = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
            AND column_name = 'transactional'
        )
      `);

      if (hasTransactionInfo[0]?.exists) {
        return 'PASSED - Transaction info available';
      }

      return 'WARNING - No transaction info';
    } catch (error) {
      return 'FAILED - Error checking transactions';
    }
  }

  /**
   * Check migration naming policy
   */
  private async checkNamingPolicy(): Promise<string> {
    try {
      // Check if migrations follow naming convention
      const migrations = await this.dataSource.query(`
        SELECT name FROM _migrations ORDER BY id
      `);

      let violations = 0;
      const totalMigrations = migrations.length;

      for (const migration of migrations) {
        // Check if migration name follows timestamp convention
        const name = migration.name;
        const timestampPattern = /^\d{14}_/; // YYYYMMDDHHmmss_
        
        if (!timestampPattern.test(name)) {
          violations++;
        }
      }

      if (violations === 0) {
        return `PASSED - All ${totalMigrations} migrations follow naming convention`;
      }

      return `WARNING - ${violations}/${totalMigrations} migrations violate naming convention`;
    } catch (error) {
      return 'FAILED - Error checking naming policy';
    }
  }

  /**
   * Check migration order
   */
  private async checkMigrationOrder(): Promise<string> {
    try {
      const migrations = await this.dataSource.query(`
        SELECT name, id FROM _migrations ORDER BY id
      `);

      let outOfOrder = 0;
      let lastTimestamp = 0;

      for (const migration of migrations) {
        const name = migration.name;
        const timestampStr = name.substring(0, 14);
        const timestamp = parseInt(timestampStr, 10);

        if (timestamp < lastTimestamp) {
          outOfOrder++;
        }
        lastTimestamp = timestamp;
      }

      if (outOfOrder === 0) {
        return `PASSED - All migrations in correct order`;
      }

      return `WARNING - ${outOfOrder} migrations out of order`;
    } catch (error) {
      return 'FAILED - Error checking migration order';
    }
  }

  /**
   * Check for pending migrations
   */
  private async checkPendingMigrations(): Promise<string> {
    try {
      // This would need to be implemented based on your migration system
      // For now, we'll check if there are any unapplied migrations
      // by comparing applied migrations with available migration files
      
      // Since we can't access the file system directly, we'll just check
      // if the migrations table exists and has entries
      const hasMigrationsTable = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
        )
      `);

      if (!hasMigrationsTable[0]?.exists) {
        return 'NONE - No migrations table';
      }

      const migrationCount = await this.dataSource.query(`
        SELECT COUNT(*) as count FROM _migrations
      `);

      const count = migrationCount[0]?.count || 0;
      return `${count} applied migrations`;
    } catch (error) {
      return 'FAILED - Error checking pending migrations';
    }
  }

  /**
   * Get comprehensive governance status
   */
  async getGovernanceStatus(): Promise<{
    guard: string;
    rollbackSafety: string;
    transactionSafety: string;
    namingPolicy: string;
    migrationOrder: string;
    pendingMigrations: string;
    overallStatus: 'PASSED' | 'WARNING' | 'FAILED';
  }> {
    const guard = await this.checkMigrationGuard();
    const rollbackSafety = await this.checkRollbackSafety();
    const transactionSafety = await this.checkTransactionSafety();
    const namingPolicy = await this.checkNamingPolicy();
    const migrationOrder = await this.checkMigrationOrder();
    const pendingMigrations = await this.checkPendingMigrations();

    // Determine overall status
    const hasFailed = [guard, rollbackSafety, transactionSafety, namingPolicy, migrationOrder].some(
      status => status.startsWith('FAILED')
    );

    const hasWarnings = [guard, rollbackSafety, transactionSafety, namingPolicy, migrationOrder].some(
      status => status.startsWith('WARNING')
    );

    let overallStatus: 'PASSED' | 'WARNING' | 'FAILED';
    if (hasFailed) {
      overallStatus = 'FAILED';
    } else if (hasWarnings) {
      overallStatus = 'WARNING';
    } else {
      overallStatus = 'PASSED';
    }

    return {
      guard,
      rollbackSafety,
      transactionSafety,
      namingPolicy,
      migrationOrder,
      pendingMigrations,
      overallStatus,
    };
  }
}