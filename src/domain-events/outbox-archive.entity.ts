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

  @Column()
  eventType: string;

  @Column("jsonb")
  payload: any;

  @Column({ type: "varchar" })
  status: OutboxStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
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
}
