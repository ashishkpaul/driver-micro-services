import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { OutboxStatus } from "../domain-events/outbox-status.enum";

@Entity("outbox")
export class OutboxEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    name: "event_type",
    type: "varchar",
  })
  eventType!: string;

  @Column("jsonb")
  payload: any;

  @Column({
    type: "enum",
    enum: OutboxStatus,
    enumName: "outbox_status_enum",
  })
  status!: OutboxStatus;

  @Column({
    name: "retry_count",
    type: "int",
    default: 0,
  })
  retryCount!: number;

  @Column({
    name: "last_error",
    type: "text",
    nullable: true,
  })
  lastError?: string;

  @Column({
    name: "next_retry_at",
    type: "timestamp",
    nullable: true,
  })
  nextRetryAt?: Date;

  @CreateDateColumn({
    name: "created_at",
  })
  createdAt!: Date;

  @Column({
    name: "processed_at",
    type: "timestamp",
    nullable: true,
  })
  processedAt?: Date;

  @Column({
    name: "locked_at",
    type: "timestamp",
    nullable: true,
  })
  lockedAt?: Date;

  @Column({
    name: "locked_by",
    type: "varchar",
    nullable: true,
  })
  lockedBy?: string;

  @Column({
    name: "updated_at",
    type: "timestamp",
    nullable: true,
  })
  updatedAt?: Date;

  @Column({
    name: "idempotency_key",
    type: "varchar",
    nullable: true,
  })
  idempotencyKey?: string;

  @Column({
    name: "version",
    type: "int",
    default: 1,
  })
  version!: number;
}
