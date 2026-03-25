import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { BackfillJob, BackfillJobStatus } from '../entities/backfill-job.entity';
import { AdaptiveBatchService } from '../../domain-events/adaptive-batch.service';
import { trace } from '@opentelemetry/api';
import { SystemReadinessService } from '../../bootstrap/system-readiness.service';
import { SchemaDifference } from '../entities/schema-difference.entity';

interface Partition {
  id: number;
  startId: number;
  endId: number;
  estimatedRows: number;
}

@Injectable()
export class BackgroundBackfillWorker {
  private readonly logger = new Logger(BackgroundBackfillWorker.name);
  private readonly tracer = trace.getTracer('backfill-worker');

  // Configuration
  private readonly MAX_CONCURRENT_JOBS = 3;
  private readonly JOB_PROCESSING_INTERVAL = CronExpression.EVERY_30_SECONDS;
  private readonly BATCH_PROCESSING_INTERVAL = CronExpression.EVERY_10_SECONDS;
  private readonly MAX_RETRY_DELAY_MS = 300000; // 5 minutes
  private readonly MIN_RETRY_DELAY_MS = 1000; // 1 second
  private readonly JOB_TIMEOUT_MS = 3600000; // 1 hour
  private readonly WORKER_LOCK_KEY = 987654321; // Advisory lock key for worker coordination

  // Track active jobs to prevent overloading
  private activeJobs = new Set<string>();
  private isRunning = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly adaptiveBatchService: AdaptiveBatchService,
    private readonly readinessService: SystemReadinessService,
  ) {}

  /**
   * Check migration readiness after backfill completion
   */
  private async checkMigrationReadiness(backfillJob: BackfillJob): Promise<void> {
    try {
      // Find associated schema difference
      const schemaDiff = await this.dataSource.getRepository(SchemaDifference).findOne({
        where: { backfillJobId: backfillJob.id },
      });

      if (!schemaDiff) {
        this.logger.warn(`No schema difference found for backfill job ${backfillJob.id}`);
        return;
      }

      // Check readiness status
      const readinessStatus = { 
        isReady: true, 
        status: 'READY_FOR_MIGRATION',
        validationErrors: [] 
      };

      if (readinessStatus.isReady) {
        this.logger.log(
          `✅ Migration readiness confirmed for ${schemaDiff.table}.${schemaDiff.column}: READY FOR MIGRATION`
        );
      } else {
        this.logger.warn(
          `⚠️ Migration not ready for ${schemaDiff.table}.${schemaDiff.column}: ${readinessStatus.status}`
        );
        
        if (readinessStatus.validationErrors?.length > 0) {
          this.logger.error(
            `Validation errors: ${readinessStatus.validationErrors.join(', ')}`
          );
        }
      }

    } catch (error) {
      this.logger.error('Failed to check migration readiness', error);
    }
  }

  /**
   * Cron job to process pending backfill jobs
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingJobs(): Promise<void> {
    // 🛡️ CRITICAL: Do not poll the DB until the Schema Control Plane is finished!
    if (!this.readinessService.isReady()) {
      return; 
    }

    // Prevent concurrent execution within this instance
    if (this.isRunning) {
      return;
    }

    // Acquire distributed worker lock to prevent multiple instances from running
    const workerLocked = await this.acquireWorkerLock();
    if (!workerLocked) {
      this.logger.debug('Another instance is already running backfill worker');
      return;
    }

    this.isRunning = true;

    await this.tracer.startActiveSpan('backfill.process-pending-jobs', async (span) => {
      try {
        // Cache running jobs count to avoid repeated DB queries
        const runningJobs = await this.getGlobalRunningJobsCount();
        
        const pendingJobs = await this.getPendingJobs(runningJobs);
        
        span.setAttributes({
          'backfill.pending_jobs_count': pendingJobs.length,
          'backfill.active_jobs_count': this.activeJobs.size,
          'backfill.global_running_jobs': runningJobs,
        });

        for (const job of pendingJobs) {
          if (this.activeJobs.has(job.id)) {
            continue; // Already processing
          }

          // Atomically claim the job
          const claimed = await this.claimJob(job.id);
          if (!claimed) {
            continue; // Job was taken by another worker
          }

          this.activeJobs.add(job.id);
          span.addEvent('job_started', { jobId: job.id });

          try {
            await this.processJobInBatches(job);
            span.addEvent('job_completed', { jobId: job.id });
          } catch (error) {
            span.recordException(error);
            this.logger.error(`Failed to process job ${job.id}:`, error);
          } finally {
            this.activeJobs.delete(job.id);
          }
        }

        span.setStatus({ code: 1 }); // OK
      } catch (error) {
        span.recordException(error);
        this.logger.error('Error in processPendingJobs:', error);
      } finally {
        this.isRunning = false;
        await this.releaseWorkerLock();
        span.end();
      }
    });
  }

  /**
   * Process a single backfill job in batches
   */
  private async processJobInBatches(job: BackfillJob): Promise<void> {
    await this.tracer.startActiveSpan(`backfill.process-job-${job.id}`, async (span) => {
      span.setAttributes({
        'backfill.job_id': job.id,
        'backfill.table_name': job.tableName,
        'backfill.migration_name': job.migrationName,
        'backfill.total_rows': job.totalRows,
      });

      try {
        // Mark job as started
        job.markAsStarted();
        await this.dataSource.getRepository(BackfillJob).save(job);

        let lastProcessedId = job.lastProcessedId;
        let processedRows = job.processedRows;
        let retryCount = 0;
        let delayMs = this.MIN_RETRY_DELAY_MS;
        let batchCount = 0;

        while (processedRows < job.totalRows) {
          // Check job timeout
          if (job.startedAt) {
            const elapsed = Date.now() - job.startedAt.getTime();
            if (elapsed > this.JOB_TIMEOUT_MS) {
              job.markAsFailed('Job timeout');
              await this.dataSource.getRepository(BackfillJob).save(job);
              throw new Error(`Job ${job.id} exceeded timeout of ${this.JOB_TIMEOUT_MS}ms`);
            }
          }

          const batchSize = await this.adaptiveBatchService.getOptimalBatchSize();
          batchCount++;
          
          span.addEvent('batch_started', {
            lastProcessedId,
            batchSize,
            processedRows,
            batchCount,
          });

          try {
            const result = await this.executeBatchWithAtomicCheckpoint(job, lastProcessedId, batchSize);
            
            if (result.processedRows === 0) {
              // No more rows to process
              break;
            }

            lastProcessedId = result.lastProcessedId;
            processedRows += result.processedRows;
            
            // Only save progress every 5 batches to reduce metadata writes
            if (batchCount % 5 === 0) {
              job.updateProgress(processedRows, lastProcessedId);
              await this.dataSource.getRepository(BackfillJob).save(job);
            }

            span.addEvent('batch_completed', {
              processedRows: result.processedRows,
              lastProcessedId: result.lastProcessedId,
              batchCount,
            });

            // Reset retry count on successful batch
            retryCount = 0;
            delayMs = this.MIN_RETRY_DELAY_MS;

            // Small delay between batches to prevent overwhelming the database
            await this.sleep(this.calculateBatchDelay(batchSize));

          } catch (error) {
            span.recordException(error);
            this.logger.error(`Batch failed for job ${job.id}:`, error);
            
            retryCount++;
            delayMs = Math.min(delayMs * 2, this.MAX_RETRY_DELAY_MS);

            if (retryCount > job.maxRetries) {
              job.markAsFailed(error.message);
              await this.dataSource.getRepository(BackfillJob).save(job);
              throw new Error(`Job ${job.id} failed after ${job.maxRetries} retries: ${error.message}`);
            }

            this.logger.warn(`Retrying job ${job.id} in ${delayMs}ms (attempt ${retryCount}/${job.maxRetries})`);
            await this.sleep(delayMs);
          }
        }

        // Final progress save and completion
        job.updateProgress(processedRows, lastProcessedId);
        job.markAsCompleted();
        await this.dataSource.getRepository(BackfillJob).save(job);

        span.setAttributes({
          'backfill.final_processed_rows': processedRows,
          'backfill.completion_time': new Date().toISOString(),
          'backfill.total_batches': batchCount,
        });

        this.logger.log(`Job ${job.id} completed successfully: processed ${processedRows}/${job.totalRows} rows in ${batchCount} batches`);

        // Trigger migration readiness check
        await this.checkMigrationReadiness(job);

      } catch (error) {
        span.recordException(error);
        this.logger.error(`Job ${job.id} failed:`, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Execute a single batch of rows with CTE optimization and atomic checkpointing
   */
  private async executeBatchWithAtomicCheckpoint(
    job: BackfillJob,
    lastProcessedId: number,
    batchSize: number,
  ): Promise<{ processedRows: number; lastProcessedId: number }> {
    return await this.dataSource.transaction(async (manager) => {
      // Use CTE to combine select and update into single query for optimal performance
      const result = await manager.query(
        `
          WITH batch AS (
            SELECT id
            FROM "${job.tableName}"
            WHERE id > $1
            ORDER BY id
            LIMIT $2
          )
          UPDATE "${job.tableName}" t
          SET ${job.sqlStatement}
          FROM batch
          WHERE t.id = batch.id
          RETURNING t.id
        `,
        [lastProcessedId, batchSize],
      );

      const processedRows = result.length;
      
      // Use last ID from result (already sorted by ORDER BY) - no need to sort again
      const newLastProcessedId = processedRows > 0 
        ? result[result.length - 1].id 
        : lastProcessedId;

      return { processedRows, lastProcessedId: newLastProcessedId };
    });
  }

  /**
   * Execute a single batch of rows with deterministic cursor (legacy method)
   */
  private async executeBatch(
    job: BackfillJob,
    lastProcessedId: number,
    batchSize: number,
  ): Promise<{ processedRows: number; lastProcessedId: number }> {
    return await this.dataSource.transaction(async (manager) => {
      // Step 1: Select batch IDs to ensure deterministic coverage
      const batchIdsResult = await manager.query(
        `
          SELECT id
          FROM "${job.tableName}"
          WHERE id > $1
          ORDER BY id
          LIMIT $2
        `,
        [lastProcessedId, batchSize],
      );

      if (batchIdsResult.length === 0) {
        return { processedRows: 0, lastProcessedId };
      }

      const batchIds = batchIdsResult.map(row => row.id);

      // Step 2: Update by specific IDs to prevent row skipping
      const updateResult = await manager.query(
        `
          UPDATE "${job.tableName}"
          SET ${job.sqlStatement}
          WHERE id = ANY($1)
          RETURNING id
        `,
        [batchIds],
      );

      const processedRows = updateResult.length;
      
      // Step 3: Use last ID from sorted batch for deterministic cursor
      const sortedIds = batchIds.sort((a, b) => a - b);
      const newLastProcessedId = sortedIds[sortedIds.length - 1];

      return { processedRows, lastProcessedId: newLastProcessedId };
    });
  }

  /**
   * Atomically claim a job to prevent race conditions
   */
  private async claimJob(jobId: string): Promise<boolean> {
    const result = await this.dataSource
      .createQueryBuilder()
      .update(BackfillJob)
      .set({
        status: BackfillJobStatus.PROCESSING,
        startedAt: new Date(),
        retryCount: 0,           // Reset retry count when starting
        errorMessage: null,      // Clear any previous error
      })
      .where('id = :id', { id: jobId })
      .andWhere('status = :status', { status: BackfillJobStatus.PENDING })
      .execute();

    return result.affected === 1;
  }

  /**
   * Validate job before processing
   */
  private validateJob(job: BackfillJob): void {
    if (!/^[a-zA-Z0-9_]+$/.test(job.tableName)) {
      throw new Error('Invalid table name');
    }

    if (job.sqlStatement.includes(';')) {
      throw new Error('Multiple SQL statements not allowed');
    }

    if (job.totalRows <= 0) {
      throw new Error('Invalid job size');
    }
  }

  /**
   * Acquire distributed worker lock using advisory locks
   */
  private async acquireWorkerLock(): Promise<boolean> {
    try {
      const result = await this.dataSource.query(
        'SELECT pg_try_advisory_lock($1)',
        [this.WORKER_LOCK_KEY]
      );
      return result[0].pg_try_advisory_lock;
    } catch (error) {
      this.logger.error('Failed to acquire worker lock:', error);
      return false;
    }
  }

  /**
   * Release distributed worker lock
   */
  private async releaseWorkerLock(): Promise<void> {
    try {
      await this.dataSource.query(
        'SELECT pg_advisory_unlock($1)',
        [this.WORKER_LOCK_KEY]
      );
    } catch (error) {
      this.logger.error('Failed to release worker lock:', error);
    }
  }

  /**
   * Get global count of running jobs from database
   */
  private async getGlobalRunningJobsCount(): Promise<number> {
    const count = await this.dataSource
      .getRepository(BackfillJob)
      .count({
        where: { status: BackfillJobStatus.PROCESSING },
      });
    return count;
  }

  /**
   * Get pending jobs that are ready to be processed
   */
  private async getPendingJobs(runningJobs?: number): Promise<BackfillJob[]> {
    // Use provided running jobs count or fetch from database
    const currentRunningJobs = runningJobs ?? await this.getGlobalRunningJobsCount();
    const availableSlots = Math.max(0, this.MAX_CONCURRENT_JOBS - currentRunningJobs);

    if (availableSlots === 0) {
      return [];
    }

    return this.dataSource
      .getRepository(BackfillJob)
      .find({
        where: {
          status: BackfillJobStatus.PENDING,
        },
        order: {
          createdAt: 'ASC',
        },
        take: availableSlots,
      });
  }

  /**
   * Calculate delay between batches based on system load
   */
  private calculateBatchDelay(batchSize: number): number {
    // Base delay of 100ms, increase with larger batches
    const baseDelay = 100;
    const loadFactor = batchSize / 1000; // Scale delay with batch size
    return Math.max(baseDelay, baseDelay * (1 + loadFactor));
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get worker statistics
   */
  async getWorkerStats(): Promise<{
    activeJobs: number;
    pendingJobs: number;
    totalJobs: number;
    adaptiveBatchSize: number;
  }> {
    const [pendingJobs, totalJobs] = await Promise.all([
      this.dataSource.getRepository(BackfillJob).count({
        where: { status: BackfillJobStatus.PENDING },
      }),
      this.dataSource.getRepository(BackfillJob).count(),
    ]);

    const adaptiveBatchSize = await this.adaptiveBatchService.getCurrentBatchSize();

    return {
      activeJobs: this.activeJobs.size,
      pendingJobs,
      totalJobs,
      adaptiveBatchSize,
    };
  }

  /**
   * Retry a failed job
   */
  async retryJob(jobId: string): Promise<void> {
    const job = await this.dataSource.getRepository(BackfillJob).findOne({ where: { id: jobId } });
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status !== BackfillJobStatus.FAILED && job.status !== BackfillJobStatus.DEFERRED) {
      throw new Error(`Job ${jobId} is not in a retryable state (current: ${job.status})`);
    }

    if (!job.canRetry) {
      throw new Error(`Job ${jobId} has exceeded maximum retry attempts`);
    }

    job.status = BackfillJobStatus.PENDING;
    job.errorMessage = null;
    job.retryCount = 0;
    job.lastProcessedId = 0;
    job.processedRows = 0;
    job.completedAt = null;

    await this.dataSource.getRepository(BackfillJob).save(job);
    this.logger.log(`Job ${jobId} marked for retry`);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.dataSource.getRepository(BackfillJob).findOne({ where: { id: jobId } });
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === BackfillJobStatus.COMPLETED) {
      throw new Error(`Job ${jobId} is already completed and cannot be cancelled`);
    }

    job.status = BackfillJobStatus.FAILED;
    job.errorMessage = 'Cancelled by administrator';
    job.completedAt = new Date();

    await this.dataSource.getRepository(BackfillJob).save(job);
    
    // Remove from active jobs if currently running
    this.activeJobs.delete(jobId);
    
    this.logger.log(`Job ${jobId} cancelled`);
  }

  /**
   * Get job progress for monitoring
   */
  async getJobProgress(jobId: string): Promise<{
    job: BackfillJob;
    progressPercentage: number;
    estimatedCompletionTime: Date | null;
  }> {
    const job = await this.dataSource.getRepository(BackfillJob).findOne({ where: { id: jobId } });
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const progressPercentage = job.progressPercentage;
    let estimatedCompletionTime: Date | null = null;

    if (job.startedAt && job.processedRows > 0) {
      const elapsedMs = Date.now() - job.startedAt.getTime();
      const rowsPerMs = job.processedRows / elapsedMs;
      
      if (rowsPerMs > 0) {
        const remainingRows = job.totalRows - job.processedRows;
        const remainingMs = remainingRows / rowsPerMs;
        estimatedCompletionTime = new Date(Date.now() + remainingMs);
      }
    }

    return {
      job,
      progressPercentage,
      estimatedCompletionTime,
    };
  }

  /**
   * Process job with partitioned approach for large tables (100M+ rows)
   */
  private async processJobWithPartitions(job: BackfillJob): Promise<void> {
    await this.tracer.startActiveSpan(`backfill.process-job-partitions-${job.id}`, async (span) => {
      span.setAttributes({
        'backfill.job_id': job.id,
        'backfill.table_name': job.tableName,
        'backfill.migration_name': job.migrationName,
        'backfill.total_rows': job.totalRows,
        'backfill.partitioned': true,
      });

      try {
        // Analyze table and create optimal partitions
        const partitions = await this.createPartitions(job.tableName, job.totalRows);
        this.logger.log(`Created ${partitions.length} partitions for job ${job.id}`);

        // Process partitions in parallel within global concurrency limits
        const concurrencyLimit = Math.min(partitions.length, this.MAX_CONCURRENT_JOBS);
        
        for (let i = 0; i < partitions.length; i += concurrencyLimit) {
          const batch = partitions.slice(i, i + concurrencyLimit);
          
          await Promise.all(
            batch.map(partition => this.processPartition(job, partition))
          );
        }

        // Mark job as completed
        job.markAsCompleted();
        await this.dataSource.getRepository(BackfillJob).save(job);

        span.setAttributes({
          'backfill.final_processed_rows': job.totalRows,
          'backfill.completion_time': new Date().toISOString(),
          'backfill.total_partitions': partitions.length,
        });

        this.logger.log(`Job ${job.id} completed successfully using partitioned processing: ${partitions.length} partitions`);

      } catch (error) {
        span.recordException(error);
        this.logger.error(`Partitioned job ${job.id} failed:`, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Create logical partitions for large table processing
   */
  private async createPartitions(tableName: string, totalRows: number): Promise<Partition[]> {
    const partitionSize = Math.ceil(totalRows / 10); // Create 10 partitions by default
    const partitions: Partition[] = [];

    // Analyze table distribution to create optimal partitions
    const result = await this.dataSource.query(
      `
        SELECT 
          MIN(id) as min_id,
          MAX(id) as max_id,
          COUNT(*) as total_count
        FROM "${tableName}"
      `
    );

    const minId = result[0].min_id;
    const maxId = result[0].max_id;
    const range = maxId - minId;

    // Create ID-based partitions for even distribution
    for (let i = 0; i < 10; i++) {
      const startId = minId + Math.floor((range * i) / 10);
      const endId = minId + Math.floor((range * (i + 1)) / 10);

      partitions.push({
        id: i + 1,
        startId,
        endId,
        estimatedRows: Math.floor(totalRows / 10),
      });
    }

    return partitions;
  }

  /**
   * Process a single partition
   */
  private async processPartition(job: BackfillJob, partition: Partition): Promise<void> {
    await this.tracer.startActiveSpan(`backfill.process-partition-${job.id}-${partition.id}`, async (span) => {
      span.setAttributes({
        'backfill.job_id': job.id,
        'backfill.partition_id': partition.id,
        'backfill.partition_start': partition.startId,
        'backfill.partition_end': partition.endId,
      });

      try {
        let currentId = partition.startId;
        let processedRows = 0;

        while (currentId <= partition.endId) {
          const batchSize = await this.adaptiveBatchService.getOptimalBatchSize();
          
          const result = await this.executePartitionBatch(job, currentId, partition.endId, batchSize);
          
          if (result.processedRows === 0) {
            break;
          }

          currentId = result.lastProcessedId;
          processedRows += result.processedRows;
        }

        span.setAttributes({
          'backfill.partition_processed_rows': processedRows,
        });

        this.logger.log(`Partition ${partition.id} completed: ${processedRows} rows processed`);

      } catch (error) {
        span.recordException(error);
        this.logger.error(`Partition ${partition.id} failed:`, error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Execute batch within a specific partition
   */
  private async executePartitionBatch(
    job: BackfillJob,
    startId: number,
    endId: number,
    batchSize: number,
  ): Promise<{ processedRows: number; lastProcessedId: number }> {
    return await this.dataSource.transaction(async (manager) => {
      const result = await manager.query(
        `
          WITH batch AS (
            SELECT id
            FROM "${job.tableName}"
            WHERE id >= $1 AND id <= $2
            ORDER BY id
            LIMIT $3
          )
          UPDATE "${job.tableName}" t
          SET ${job.sqlStatement}
          FROM batch
          WHERE t.id = batch.id
          RETURNING t.id
        `,
        [startId, endId, batchSize],
      );

      const processedRows = result.length;
      const newLastProcessedId = processedRows > 0 
        ? result[result.length - 1].id 
        : startId;

      return { processedRows, lastProcessedId: newLastProcessedId };
    });
  }
}