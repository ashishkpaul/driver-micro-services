import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum BackfillJobStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEFERRED = 'DEFERRED',
}

@Entity('backfill_jobs')
export class BackfillJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'table_name', type: 'varchar', length: 255 })
  tableName: string;

  @Column({ name: 'migration_name', type: 'varchar', length: 255 })
  migrationName: string;

  @Column({ name: 'sql_statement', type: 'varchar', length: 500 })
  sqlStatement: string;

  @Column({ name: 'total_rows', type: 'bigint' })
  totalRows: number;

  @Column({ name: 'processed_rows', type: 'bigint', default: 0 })
  processedRows: number;

  @Column({ name: 'last_processed_id', type: 'bigint', default: 0 })
  lastProcessedId: number;

  @Column({
    name: 'status',
    type: 'enum',
    enum: BackfillJobStatus,
    default: BackfillJobStatus.PENDING,
  })
  status: BackfillJobStatus;

  @Column({ name: 'batch_size', type: 'integer', default: 1000 })
  batchSize: number;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount: number;

  @Column({ name: 'max_retries', type: 'integer', default: 5 })
  maxRetries: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'last_processed_at', type: 'timestamp', nullable: true })
  lastProcessedAt: Date;

  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Calculate progress percentage
   */
  get progressPercentage(): number {
    if (this.totalRows === 0) return 0;
    return Math.round((this.processedRows / this.totalRows) * 100);
  }

  /**
   * Check if job is complete
   */
  get isComplete(): boolean {
    return this.status === BackfillJobStatus.COMPLETED || this.status === BackfillJobStatus.FAILED;
  }

  /**
   * Check if job can be retried
   */
  get canRetry(): boolean {
    return this.status === BackfillJobStatus.FAILED && this.retryCount < this.maxRetries;
  }

  /**
   * Update progress
   */
  updateProgress(processedRows: number, lastProcessedId: number): void {
    this.processedRows = processedRows;
    this.lastProcessedId = lastProcessedId;
    this.lastProcessedAt = new Date();
  }

  /**
   * Mark job as started
   */
  markAsStarted(): void {
    this.status = BackfillJobStatus.PROCESSING;
    this.startedAt = new Date();
    this.retryCount = 0;
    this.errorMessage = null;
  }

  /**
   * Mark job as completed
   */
  markAsCompleted(): void {
    this.status = BackfillJobStatus.COMPLETED;
    this.completedAt = new Date();
  }

  /**
   * Mark job as failed
   */
  markAsFailed(errorMessage: string): void {
    this.status = BackfillJobStatus.FAILED;
    this.errorMessage = errorMessage;
    this.retryCount += 1;
  }

  /**
   * Mark job as deferred
   */
  markAsDeferred(reason: string): void {
    this.status = BackfillJobStatus.DEFERRED;
    this.errorMessage = reason;
  }
}