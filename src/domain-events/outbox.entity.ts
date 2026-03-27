import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { OutboxStatus } from "./outbox-status.enum";
import { WS_EVENTS } from "../../../packages/ws-contracts";

// Event version types for type safety
export type EventVersion = 1 | 2 | 3;

// Type-safe event type derived from shared WS_EVENTS constant
export type OutboxEventType = (typeof WS_EVENTS)[keyof typeof WS_EVENTS];

@Entity("outbox")
@Index("idx_outbox_worker", ["status", "nextRetryAt"], {
  where: "(status = 'PENDING'::outbox_status_enum)",
})
@Index("idx_outbox_locked", ["lockedAt"], {
  where: "(status = 'PROCESSING'::outbox_status_enum)",
})
export class OutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: "event_type",
    type: "varchar",
    length: 255,
  })
  eventType!: string;

  @Column("jsonb")
  payload: any;

  @Column({
    type: "enum",
    enum: OutboxStatus,
    enumName: "outbox_status_enum", // Verify this name exists in pg_type
    nullable: false,
  })
  status!: OutboxStatus;

  // Priority field for critical event processing
  @Column({
    type: "enum",
    enum: ["HIGH", "MEDIUM", "LOW"],
    enumName: "outbox_priority_enum", // 👈 ADDED: Required by Postgres
    default: "MEDIUM",
  })
  priority: "HIGH" | "MEDIUM" | "LOW";

  @Column({ default: 0 })
  retryCount: number;

  @Column({
    name: "last_error",
    type: "varchar", // Changed from 'text' to 'varchar'
    nullable: true,
  })
  lastError?: string;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at", nullable: true })
  updatedAt?: Date;

  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true })
  lockedAt?: Date;

  @Column({ nullable: true })
  lockedBy?: string;

  @Column({
    name: "idempotency_key",
    type: "varchar",
    nullable: false,
    unique: true,
  })
  idempotencyKey!: string;

  @Column({
    type: "smallint",
    default: 1,
  })
  version: EventVersion;
}
