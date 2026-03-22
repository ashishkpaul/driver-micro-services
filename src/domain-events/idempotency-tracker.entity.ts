import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

@Entity("idempotency_tracker")
@Index("idx_idempotency_key", ["idempotencyKey"])
@Index("idx_idempotency_status", ["status"])
@Index("idx_idempotency_created_at", ["createdAt"])
export class IdempotencyTracker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: "idempotency_key",
    type: "varchar",
    length: 255,
    unique: true,
  })
  idempotencyKey: string;

  @Column({
    name: "event_type",
    type: "varchar",
    length: 255,
  })
  eventType: string;

  @Column({ type: "jsonb" })
  payload: any;

  @Column({
    type: "enum",
    enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED"],
    enumName: "idempotency_status_enum", // 👈 ADDED: Prevents ad-hoc naming crashes
    default: "PENDING",
  })
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

  @Column({ name: "event_id", type: "integer", nullable: true })
  eventId?: number;

  @Column({ name: "worker_id", type: "varchar", nullable: true })
  workerId?: string;

  @Column({ name: "processing_start", type: "timestamp", nullable: true })
  processingStart?: Date;

  @Column({ name: "processing_end", type: "timestamp", nullable: true })
  processingEnd?: Date;

  @Column({ name: "retry_count", type: "integer", default: 0 })
  retryCount: number;

  @Column({ name: "last_error", type: "text", nullable: true })
  lastError?: string;

  @Column({ name: "processing_duration_ms", type: "integer", nullable: true })
  processingDurationMs?: number;

  @Column({ name: "payload_hash", type: "varchar", length: 64, nullable: true })
  payloadHash?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;

  @Column({ name: "completed_at", type: "timestamp", nullable: true })
  completedAt?: Date;

  @Column({ name: "failed_at", type: "timestamp", nullable: true })
  failedAt?: Date;

  @Column({ name: "debug_info", type: "jsonb", nullable: true })
  debugInfo?: {
    batchSize?: number;
    queuePosition?: number;
    systemLoad?: number;
    memoryUsage?: number;
    cpuUsage?: number;
  };
}
