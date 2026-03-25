import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SchemaDifference, SchemaDifferenceStatus } from '../entities/schema-difference.entity';
import { BackfillJob } from '../entities/backfill-job.entity';

export interface MigrationReadinessStatus {
  isReady: boolean;
  status: 'PENDING' | 'BACKFILLING' | 'READY_FOR_MIGRATION' | 'MIGRATED';
  backfillJobId?: string;
  validationStatus?: 'PENDING' | 'PASSED' | 'FAILED';
  validationErrors?: string[];
  lastChecked: Date;
}

@Injectable()
export class MigrationReadinessService {
  private readonly logger = new Logger(MigrationReadinessService.name);

  constructor(
    @InjectRepository(SchemaDifference)
    private readonly schemaDiffRepo: Repository<SchemaDifference>,
    @InjectRepository(BackfillJob)
    private readonly backfillJobRepo: Repository<BackfillJob>,
  ) {}

  /**
   * Check if a schema difference is ready for migration
   */
  async checkReadiness(schemaDiffId: string): Promise<MigrationReadinessStatus> {
    const schemaDiff = await this.schemaDiffRepo.findOne({
      where: { id: schemaDiffId },
      relations: ['backfillJob'],
    });

    if (!schemaDiff) {
      throw new Error(`Schema difference ${schemaDiffId} not found`);
    }

    // Check if migration already completed
    if (schemaDiff.status === 'MIGRATED') {
      return {
        isReady: false,
        status: 'MIGRATED',
        lastChecked: new Date(),
      };
    }

    // Check if already marked as ready (idempotency guard)
    if (schemaDiff.readiness === 'READY_FOR_MIGRATION' && schemaDiff.validationStatus === 'PASSED') {
      return {
        isReady: true,
        status: 'READY_FOR_MIGRATION',
        backfillJobId: schemaDiff.backfillJobId || undefined,
        validationStatus: 'PASSED',
        lastChecked: new Date(),
      };
    }

    // Check if backfill job exists
    if (!schemaDiff.backfillJob) {
      return {
        isReady: false,
        status: 'PENDING',
        lastChecked: new Date(),
      };
    }

    const backfillJob = schemaDiff.backfillJob;
    
    // Check if backfill is still in progress
    if (backfillJob.status === 'PROCESSING') {
      return {
        isReady: false,
        status: 'BACKFILLING',
        backfillJobId: backfillJob.id,
        lastChecked: new Date(),
      };
    }

    // Check if backfill completed successfully
    if (backfillJob.status === 'COMPLETED') {
      const validation = await this.validateBackfillCompletion(backfillJob);
      
      if (validation.isValid) {
        // Mark as ready for migration (idempotent operation)
        await this.schemaDiffRepo.update(schemaDiffId, {
          readiness: 'READY_FOR_MIGRATION',
          validationStatus: 'PASSED',
        });

        return {
          isReady: true,
          status: 'READY_FOR_MIGRATION',
          backfillJobId: backfillJob.id,
          validationStatus: 'PASSED',
          lastChecked: new Date(),
        };
      } else {
        return {
          isReady: false,
          status: 'BACKFILLING', // Still needs validation
          backfillJobId: backfillJob.id,
          validationStatus: 'FAILED',
          validationErrors: validation.errors,
          lastChecked: new Date(),
        };
      }
    }

    // Backfill failed or other error state
    return {
      isReady: false,
      status: 'BACKFILLING', // Treat as still in progress for safety
      backfillJobId: backfillJob.id,
      validationStatus: 'FAILED',
      validationErrors: ['Backfill job failed'],
      lastChecked: new Date(),
    };
  }

  /**
   * Validate that backfill completed successfully
   */
  private async validateBackfillCompletion(backfillJob: BackfillJob): Promise<{
    isValid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    try {
      // Check if all rows were processed
      if (backfillJob.processedRows < backfillJob.totalRows) {
        errors.push(
          `Incomplete processing: ${backfillJob.processedRows}/${backfillJob.totalRows} rows processed`,
        );
      }

      // Check for processing errors
      if (backfillJob.errorMessage) {
        errors.push(`Processing errors: ${backfillJob.errorMessage}`);
      }

      // Get column details for validation
      const { tableName, columnName, targetType } = await this.getBackfillJobDetails(backfillJob.id);

      // Validate data integrity for the specific column
      const validation = await this.validateColumnData(
        tableName,
        columnName,
        targetType,
      );

      if (!validation.isValid) {
        errors.push(...validation.errors);
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Validation failed', error);
      return {
        isValid: false,
        errors: ['Validation failed: ' + error.message],
      };
    }
  }

  /**
   * Validate data integrity for a specific column after backfill
   */
  private async validateColumnData(
    tableName: string,
    columnName: string,
    targetType: string,
  ): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Check for NULL values in converted column
      const nullCountQuery = `
        SELECT COUNT(*) as null_count 
        FROM ${tableName} 
        WHERE ${columnName} IS NULL
      `;
      
      const [nullResult] = await this.schemaDiffRepo.query(nullCountQuery);
      const nullCount = parseInt(nullResult.null_count || '0');

      if (nullCount > 0) {
        errors.push(`Found ${nullCount} NULL values in converted column ${columnName}`);
      }

      // Check for invalid UUID format if target is UUID
      if (targetType.toLowerCase() === 'uuid') {
        const invalidUuidQuery = `
          SELECT COUNT(*) as invalid_count 
          FROM ${tableName} 
          WHERE ${columnName} IS NOT NULL 
          AND ${columnName} !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        `;
        
        const [invalidResult] = await this.schemaDiffRepo.query(invalidUuidQuery);
        const invalidCount = parseInt(invalidResult.invalid_count || '0');

        if (invalidCount > 0) {
          errors.push(`Found ${invalidCount} invalid UUID values in column ${columnName}`);
        }
      }

      // Check for empty strings if target is UUID
      if (targetType.toLowerCase() === 'uuid') {
        const emptyStringQuery = `
          SELECT COUNT(*) as empty_count 
          FROM ${tableName} 
          WHERE ${columnName} = ''
        `;
        
        const [emptyResult] = await this.schemaDiffRepo.query(emptyStringQuery);
        const emptyCount = parseInt(emptyResult.empty_count || '0');

        if (emptyCount > 0) {
          errors.push(`Found ${emptyCount} empty string values in column ${columnName}`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Column validation failed', error);
      return {
        isValid: false,
        errors: ['Column validation failed: ' + error.message],
      };
    }
  }

  /**
   * Get backfill job details for validation
   */
  private async getBackfillJobDetails(backfillJobId: string): Promise<{
    tableName: string;
    columnName: string;
    targetType: string;
  }> {
    const backfillJob = await this.backfillJobRepo.findOne({
      where: { id: backfillJobId },
    });

    if (!backfillJob) {
      throw new Error(`Backfill job ${backfillJobId} not found`);
    }

    // Extract table and column from SQL statement
    const match = backfillJob.sqlStatement.match(/UPDATE\s+(\w+)\s+SET\s+(\w+)\s*=/i);
    if (!match) {
      throw new Error('Could not extract table and column from backfill SQL');
    }

    const tableName = match[1];
    const columnName = match[2];
    const targetType = backfillJob.metadata?.targetType || 'uuid';

    return {
      tableName,
      columnName,
      targetType,
    };
  }

  /**
   * Mark a schema difference as migrated
   */
  async markAsMigrated(schemaDiffId: string): Promise<void> {
    await this.schemaDiffRepo.update(schemaDiffId, {
      status: SchemaDifferenceStatus.MIGRATED,
      readiness: 'MIGRATED',
      validationStatus: 'PASSED',
      migratedAt: new Date(),
    });

    this.logger.log(`Schema difference ${schemaDiffId} marked as migrated`);
  }

  /**
   * Get readiness status for all schema differences
   */
  async getAllReadinessStatus(): Promise<MigrationReadinessStatus[]> {
    const schemaDiffs = await this.schemaDiffRepo.find({
      relations: ['backfillJob'],
      where: {
        status: SchemaDifferenceStatus.DRIFT_DETECTED,
      },
    });

    const results: MigrationReadinessStatus[] = [];

    for (const schemaDiff of schemaDiffs) {
      const status = await this.checkReadiness(schemaDiff.id);
      results.push(status);
    }

    return results;
  }

  /**
   * Get summary of migration readiness across all schema differences
   */
  async getReadinessSummary(): Promise<{
    total: number;
    readyForMigration: number;
    backfilling: number;
    pending: number;
    migrated: number;
  }> {
    const schemaDiffs = await this.schemaDiffRepo.find({
      relations: ['backfillJob'],
    });

    let readyForMigration = 0;
    let backfilling = 0;
    let pending = 0;
    let migrated = 0;

    for (const schemaDiff of schemaDiffs) {
      const status = await this.checkReadiness(schemaDiff.id);
      
      switch (status.status) {
        case 'READY_FOR_MIGRATION':
          readyForMigration++;
          break;
        case 'BACKFILLING':
          backfilling++;
          break;
        case 'PENDING':
          pending++;
          break;
        case 'MIGRATED':
          migrated++;
          break;
      }
    }

    return {
      total: schemaDiffs.length,
      readyForMigration,
      backfilling,
      pending,
      migrated,
    };
  }
}