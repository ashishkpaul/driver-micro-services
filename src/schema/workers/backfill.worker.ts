import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, Repository } from 'typeorm';
import { BackfillJob, BackfillJobStatus } from '../entities/backfill-job.entity';
import { AdaptiveBatchService } from '../../domain-events/adaptive-batch.service';
import { trace } from '@opentelemetry/api';

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

  // Track active jobs to prevent overloading
  private activeJobs = new Set<string>();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(BackfillJob)
    private readonly backfillJobRepository: Repository<BackfillJob>,
    private readonly adaptiveBatchService: AdaptiveBatchService,
  ) {}

  /**
   * Cron job to process pending backfill jobs
   */
  @Cron(CronExpression.EVERY_30_SECONDS)
  async processPendingJobs(): Promise<void> {
    await this.tracer.startActiveSpan('backfill.process-pending-jobs', async (span) => {
      try {
        const pendingJobs = await this.getPendingJobs();
        
        span.setAttributes({
          'backfill.pending_jobs_count': pendingJobs.length,
          'backfill.active_jobs_count': this.activeJobs.size,
        });

        for (const job of pendingJobs) {
          if (this.activeJobs.size >= this.MAX_CONCURRENT_JOBS) {
            this.logger.warn(`Maximum concurrent jobs reached (${this.MAX_CONCURRENT_JOBS}), skipping job ${job.id}`);
            break;
          }

          if (this.activeJobs.has(job.id)) {
            continue; // Already processing
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
        await this.backfillJobRepository.save(job);

        let lastProcessedId = job.lastProcessedId;
        let processedRows = job.processedRows;
        let retryCount = 0;
        let delayMs = this.MIN_RETRY_DELAY_MS;

        while (processedRows < job.totalRows) {
          const batchSize = await this.adaptiveBatchService.getOptimalBatchSize();
          
          span.addEvent('batch_started', {
            lastProcessedId,
            batchSize,
            processedRows,
          });

          try {
            const result = await this.executeBatch(job, lastProcessedId, batchSize);
            
            if (result.processedRows === 0) {
              // No more rows to process
              break;
            }

            lastProcessedId = result.lastProcessedId;
            processedRows += result.processedRows;
            
            job.updateProgress(processedRows, lastProcessedId);
            await this.backfillJobRepository.save(job);

            span.addEvent('batch_completed', {
              processedRows: result.processedRows,
              lastProcessedId: result.lastProcessedId,
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
              await this.backfillJobRepository.save(job);
              throw new Error(`Job ${job.id} failed after ${job.maxRetries} retries: ${error.message}`);
            }

            this.logger.warn(`Retrying job ${job.id} in ${delayMs}ms (attempt ${retryCount}/${job.maxRetries})`);
            await this.sleep(delayMs);
          }
        }

        // Job completed successfully
        job.markAsCompleted();
        await this.backfillJobRepository.save(job);

        span.setAttributes({
          'backfill.final_processed_rows': processedRows,
          'backfill.completion_time': new Date().toISOString(),
        });

        this.logger.log(`Job ${job.id} completed successfully: processed ${processedRows}/${job.totalRows} rows`);

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
   * Execute a single batch of rows
   */
  private async executeBatch(
    job: BackfillJob,
    lastProcessedId: number,
    batchSize: number,
  ): Promise<{ processedRows: number; lastProcessedId: number }> {
    return await this.dataSource.transaction(async (manager) => {
      // Use cursor-based pagination to avoid table locks
      const result = await manager.query(
        `
          UPDATE ${job.tableName}
          SET ${job.sqlStatement}
          WHERE id > $1
          AND id <= (
            SELECT COALESCE(MIN(id), $1 + $2)
            FROM (
              SELECT id
              FROM ${job.tableName}
              WHERE id > $1
              ORDER BY id
              LIMIT $2
            ) sub
          )
          RETURNING id
        `,
        [lastProcessedId, batchSize],
      );

      const processedRows = result.length;
      const newLastProcessedId = processedRows > 0 
        ? Math.max(...result.map(row => row.id))
        : lastProcessedId;

      return { processedRows, lastProcessedId: newLastProcessedId };
    });
  }

  /**
   * Get pending jobs that are ready to be processed
   */
  private async getPendingJobs(): Promise<BackfillJob[]> {
    return await this.backfillJobRepository.find({
      where: {
        status: BackfillJobStatus.PENDING,
      },
      order: {
        createdAt: 'ASC', // Process oldest jobs first
      },
      take: this.MAX_CONCURRENT_JOBS,
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
      this.backfillJobRepository.count({
        where: { status: BackfillJobStatus.PENDING },
      }),
      this.backfillJobRepository.count(),
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
    const job = await this.backfillJobRepository.findOne({ where: { id: jobId } });
    
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

    await this.backfillJobRepository.save(job);
    this.logger.log(`Job ${jobId} marked for retry`);
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const job = await this.backfillJobRepository.findOne({ where: { id: jobId } });
    
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    if (job.status === BackfillJobStatus.COMPLETED) {
      throw new Error(`Job ${jobId} is already completed and cannot be cancelled`);
    }

    job.status = BackfillJobStatus.FAILED;
    job.errorMessage = 'Cancelled by administrator';
    job.completedAt = new Date();

    await this.backfillJobRepository.save(job);
    
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
    const job = await this.backfillJobRepository.findOne({ where: { id: jobId } });
    
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
}