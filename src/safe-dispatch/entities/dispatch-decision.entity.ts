import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { IsNotEmpty, IsUUID, IsEnum, IsOptional, IsString } from "class-validator";
import { Driver } from "../../drivers/entities/driver.entity";
import { Delivery } from "../../deliveries/entities/delivery.entity";

export enum DispatchCohort {
  CONTROL = "CONTROL",
  SCORING = "SCORING",
  MANUAL = "MANUAL",
}

export enum DispatchMethod {
  LEGACY = "LEGACY",
  SCORING_BASED = "SCORING_BASED",
  MANUAL_OVERRIDE = "MANUAL_OVERRIDE",
}

export enum DispatchStatus {
  PENDING = "PENDING",
  ASSIGNED = "ASSIGNED",
  FAILED = "FAILED",
  TIMEOUT = "TIMEOUT",
}

@Entity("dispatch_decisions")
@Index("idx_dispatch_decisions_delivery_id", ["deliveryId"])
@Index("idx_dispatch_decisions_driver_id", ["driverId"])
@Index("idx_dispatch_decisions_cohort", ["cohort"])
@Index("idx_dispatch_decisions_method", ["dispatchMethod"])
@Index("idx_dispatch_decisions_status", ["dispatchStatus"])
@Index("idx_dispatch_decisions_created_at", ["createdAt"])
export class DispatchDecision {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  @IsNotEmpty()
  @IsUUID()
  deliveryId!: string;

  @Column({ type: "uuid", nullable: true })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @Column({
    name: "cohort",
    type: "enum",
    enum: DispatchCohort,
    enumName: "dispatch_decisions_cohort_enum",
  })
  @IsNotEmpty()
  @IsEnum(DispatchCohort)
  cohort!: DispatchCohort;

  @Column({
    name: "dispatch_method",
    type: "enum",
    enum: DispatchMethod,
    enumName: "dispatch_decisions_dispatch_method_enum",
  })
  @IsNotEmpty()
  @IsEnum(DispatchMethod)
  dispatchMethod!: DispatchMethod;

  @Column({
    name: "dispatch_status",
    type: "enum",
    enum: DispatchStatus,
    enumName: "dispatch_decisions_dispatch_status_enum",
  })
  @IsNotEmpty()
  @IsEnum(DispatchStatus)
  dispatchStatus!: DispatchStatus;

  @Column({
    name: "score_used",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  @IsOptional()
  scoreUsed?: number;

  @Column({
    name: "fallback_reason",
    type: "varchar",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  fallbackReason?: string;

  @Column({
    name: "processing_time_ms",
    type: "integer",
    nullable: true,
  })
  @IsOptional()
  processingTimeMs?: number;

  @Column({
    name: "driver_acceptance_rate",
    type: "decimal",
    precision: 5,
    scale: 2,
    nullable: true,
  })
  @IsOptional()
  driverAcceptanceRate?: number;

  @Column({
    type: "jsonb",
    nullable: true,
  })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  // Relations (if needed)
  @ManyToOne(() => Driver, { nullable: true })
  @JoinColumn({ name: "driver_id" })
  driver?: Driver;

  @ManyToOne(() => Delivery)
  @JoinColumn({ name: "delivery_id" })
  delivery!: Delivery;
}