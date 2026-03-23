import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { OutboxStatus } from "./outbox-status.enum";

@Entity("outbox_archive")
export class OutboxArchiveEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: "varchar" })
  eventType: string;

  @Column("jsonb")
  payload: any;

  @Column({
    type: "enum",
    enum: OutboxStatus,
    enumName: "outbox_status_enum",
    nullable: false,
  })
  status: OutboxStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({
    type: "varchar",
    nullable: true,
  })
  lastError?: string;

  @Column({ nullable: true })
  nextRetryAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ nullable: true })
  processedAt?: Date;

  @Column({ nullable: true })
  lockedAt?: Date;

  @Column({ nullable: true })
  lockedBy?: string;

  @Column({ unique: true, nullable: true })
  idempotencyKey?: string;

  @Column({ type: "timestamp" })
  archivedAt: Date;

  // New fields for compression and optimization
  @Column({ type: "boolean", default: false })
  isCompressed: boolean;

  @Column({ type: "jsonb", nullable: true })
  compressedPayload?: any;

  @Column({ type: "integer", nullable: true })
  originalPayloadSize?: number;

  @Column({ type: "integer", nullable: true })
  compressedPayloadSize?: number;
}
