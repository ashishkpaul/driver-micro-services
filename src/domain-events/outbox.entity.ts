import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { OutboxStatus } from "./outbox-status.enum";

// Event version types for type safety
export type EventVersion = 1 | 2 | 3;

// Versioned event types
export type VersionedEventType =
  | "DELIVERY_ASSIGNED_V1"
  | "DELIVERY_ASSIGNED_V2"
  | "DELIVERY_ASSIGNED_V3"
  | "DELIVERY_COMPLETED_V1"
  | "DELIVERY_COMPLETED_V2"
  | "DELIVERY_COMPLETED_V3"
  | "DELIVERY_FAILED_V1"
  | "DELIVERY_FAILED_V2"
  | "DELIVERY_FAILED_V3"
  | "DRIVER_STATUS_CHANGED_V1"
  | "DRIVER_STATUS_CHANGED_V2"
  | "DRIVER_STATUS_CHANGED_V3"
  | "DRIVER_ONLINE_V1"
  | "DRIVER_ONLINE_V2"
  | "DRIVER_ONLINE_V3"
  | "DRIVER_OFFLINE_V1"
  | "DRIVER_OFFLINE_V2"
  | "DRIVER_OFFLINE_V3"
  | "DELIVERY_CANCELLED_V1"
  | "DELIVERY_CANCELLED_V2"
  | "DELIVERY_CANCELLED_V3"
  | "DELIVERY_REASSIGNED_V1"
  | "DELIVERY_REASSIGNED_V2"
  | "DELIVERY_REASSIGNED_V3"
  | "DELIVERY_PICKUP_CONFIRMED_V1"
  | "DELIVERY_PICKUP_CONFIRMED_V2"
  | "DELIVERY_PICKUP_CONFIRMED_V3"
  | "DELIVERY_DROPOFF_CONFIRMED_V1"
  | "DELIVERY_DROPOFF_CONFIRMED_V2"
  | "DELIVERY_DROPOFF_CONFIRMED_V3"
  | "DELIVERY_ETA_UPDATED_V1"
  | "DELIVERY_ETA_UPDATED_V2"
  | "DELIVERY_ETA_UPDATED_V3"
  | "DELIVERY_LOCATION_UPDATED_V1"
  | "DELIVERY_LOCATION_UPDATED_V2"
  | "DELIVERY_LOCATION_UPDATED_V3"
  | "DELIVERY_STATUS_CHANGED_V1"
  | "DELIVERY_STATUS_CHANGED_V2"
  | "DELIVERY_STATUS_CHANGED_V3"
  | "DELIVERY_PRIORITY_CHANGED_V1"
  | "DELIVERY_PRIORITY_CHANGED_V2"
  | "DELIVERY_PRIORITY_CHANGED_V3"
  | "DELIVERY_ROUTE_UPDATED_V1"
  | "DELIVERY_ROUTE_UPDATED_V2"
  | "DELIVERY_ROUTE_UPDATED_V3"
  | "PROOF_ACCEPTED_V1"
  | "PROOF_ACCEPTED_V2"
  | "PROOF_ACCEPTED_V3"
  | "DRIVER_LOCATION_UPDATED_V1"
  | "DRIVER_LOCATION_UPDATED_V2"
  | "DRIVER_LOCATION_UPDATED_V3";

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
