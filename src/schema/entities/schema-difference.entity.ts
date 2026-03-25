import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { BackfillJob } from './backfill-job.entity';

export enum SchemaDifferenceStatus {
  DRIFT_DETECTED = 'DRIFT_DETECTED',
  BACKFILL_SCHEDULED = 'BACKFILL_SCHEDULED',
  BACKFILLING = 'BACKFILLING',
  READY_FOR_MIGRATION = 'READY_FOR_MIGRATION',
  MIGRATED = 'MIGRATED',
}

export enum SchemaDifferenceSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum SchemaDifferenceType {
  COLUMN_TYPE_CHANGE = 'COLUMN_TYPE_CHANGE',
  COLUMN_NULLABLE_CHANGE = 'COLUMN_NULLABLE_CHANGE',
  COLUMN_DEFAULT_CHANGE = 'COLUMN_DEFAULT_CHANGE',
  COLUMN_ADDITION = 'COLUMN_ADDITION',
  COLUMN_REMOVAL = 'COLUMN_REMOVAL',
  INDEX_ADDITION = 'INDEX_ADDITION',
  INDEX_REMOVAL = 'INDEX_REMOVAL',
  CONSTRAINT_ADDITION = 'CONSTRAINT_ADDITION',
  CONSTRAINT_REMOVAL = 'CONSTRAINT_REMOVAL',
  TABLE_ADDITION = 'TABLE_ADDITION',
  TABLE_REMOVAL = 'TABLE_REMOVAL',
}

@Entity('schema_differences')
export class SchemaDifference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  table: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  column: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  index: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  constraint: string | null;

  @Column({ type: 'varchar', length: 50 })
  type: SchemaDifferenceType;

  @Column({ type: 'varchar', length: 20 })
  severity: SchemaDifferenceSeverity;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'jsonb', nullable: true })
  entity: {
    type?: string;
    nullable?: boolean;
    default?: any;
    primaryKey?: boolean;
    unique?: boolean;
  } | null;

  @Column({ type: 'jsonb', nullable: true })
  database: {
    type?: string;
    nullable?: boolean;
    default?: any;
    primaryKey?: boolean;
    unique?: boolean;
  } | null;

  @Column({ type: 'varchar', length: 50 })
  status: SchemaDifferenceStatus;

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  readiness: 'PENDING' | 'BACKFILLING' | 'READY_FOR_MIGRATION' | 'MIGRATED';

  @Column({ type: 'varchar', length: 50, default: 'PENDING' })
  validationStatus: 'PENDING' | 'PASSED' | 'FAILED';

  @Column({ type: 'text', nullable: true })
  suggestedAction: string | null;

  @Column({ type: 'text', nullable: true })
  backfillSql: string | null;

  @Column({ type: 'uuid', nullable: true })
  backfillJobId: string | null;

  @Column({ type: 'varchar', nullable: true })
  migrationName: string | null;

  @Column({ type: 'timestamp', nullable: true })
  detectedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  backfillScheduledAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  backfillStartedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  backfillCompletedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  readyForMigrationAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  migratedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @ManyToOne(() => BackfillJob, { nullable: true })
  @JoinColumn({ name: 'backfill_job_id' })
  backfillJob: BackfillJob | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  /**
   * Check if difference requires backfill
   */
  get requiresBackfill(): boolean {
    return this.type === SchemaDifferenceType.COLUMN_TYPE_CHANGE ||
           this.type === SchemaDifferenceType.COLUMN_NULLABLE_CHANGE ||
           this.type === SchemaDifferenceType.COLUMN_DEFAULT_CHANGE;
  }

  /**
   * Check if difference is ready for migration
   */
  get isReadyForMigration(): boolean {
    return this.status === SchemaDifferenceStatus.READY_FOR_MIGRATION &&
           this.readiness === 'READY_FOR_MIGRATION' &&
           this.validationStatus === 'PASSED';
  }

  /**
   * Check if migration is complete
   */
  get isMigrated(): boolean {
    return this.status === SchemaDifferenceStatus.MIGRATED &&
           this.readiness === 'MIGRATED';
  }

  /**
   * Update status and timestamps
   */
  updateStatus(newStatus: SchemaDifferenceStatus): void {
    this.status = newStatus;
    
    switch (newStatus) {
      case SchemaDifferenceStatus.BACKFILL_SCHEDULED:
        this.backfillScheduledAt = new Date();
        break;
      case SchemaDifferenceStatus.BACKFILLING:
        this.backfillStartedAt = new Date();
        this.readiness = 'BACKFILLING';
        break;
      case SchemaDifferenceStatus.READY_FOR_MIGRATION:
        this.readyForMigrationAt = new Date();
        this.readiness = 'READY_FOR_MIGRATION';
        this.validationStatus = 'PASSED';
        break;
      case SchemaDifferenceStatus.MIGRATED:
        this.migratedAt = new Date();
        this.readiness = 'MIGRATED';
        break;
    }
  }

  /**
   * Mark as requiring backfill
   */
  markAsBackfillRequired(backfillSql: string, migrationName: string): void {
    this.backfillSql = backfillSql;
    this.migrationName = migrationName;
    this.updateStatus(SchemaDifferenceStatus.BACKFILL_SCHEDULED);
  }

  /**
   * Mark backfill as started
   */
  markBackfillStarted(backfillJobId: string): void {
    this.backfillJobId = backfillJobId;
    this.updateStatus(SchemaDifferenceStatus.BACKFILLING);
  }

  /**
   * Mark backfill as completed
   */
  markBackfillCompleted(): void {
    this.backfillCompletedAt = new Date();
    this.updateStatus(SchemaDifferenceStatus.READY_FOR_MIGRATION);
  }

  /**
   * Mark as migrated
   */
  markAsMigrated(): void {
    this.updateStatus(SchemaDifferenceStatus.MIGRATED);
  }

  /**
   * Set validation status
   */
  setValidationStatus(status: 'PENDING' | 'PASSED' | 'FAILED', errorMessage?: string): void {
    this.validationStatus = status;
    if (errorMessage) {
      this.errorMessage = errorMessage;
    }
  }
}