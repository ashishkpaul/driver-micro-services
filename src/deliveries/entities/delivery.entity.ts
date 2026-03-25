import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from "typeorm";
import { DeliveryEvent } from "./delivery-event.entity";
import {
  IsNotEmpty,
  IsUUID,
  IsNumber,
  IsOptional,
  IsEnum,
} from "class-validator";

export enum DeliveryStatus {
  PENDING = "PENDING",
  ASSIGNED = "ASSIGNED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

@Entity("deliveries")
@Index("idx_deliveries_status", ["status"])
@Index("idx_deliveries_driver_id", ["driverId"])
@Index("idx_deliveries_status_driver", ["status", "driverId"])
@Index("idx_deliveries_expected_pickup_at", ["expectedPickupAt"])
@Index("idx_deliveries_expected_delivery_at", ["expectedDeliveryAt"])
@Index("idx_deliveries_sla_breach_at", ["slaBreachAt"])
export class Delivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
    type: "uuid",
    nullable: false
  })
  @IsNotEmpty()
  @IsUUID()
  sellerOrderId!: string;

  @Column({ type: "varchar" })
  @IsNotEmpty()
  @IsUUID()
  channelId!: string;

  @Column({
    type: "uuid",
    nullable: true,
  })
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @Column({
    type: "enum",
    enum: DeliveryStatus,
    enumName: "delivery_status_enum",
    default: DeliveryStatus.PENDING,
  })
  @IsEnum(DeliveryStatus)
  status!: DeliveryStatus;

  @Column("decimal", { precision: 10, scale: 8 })
  @IsNumber()
  pickupLat!: number;

  @Column("decimal", { precision: 11, scale: 8 })
  @IsNumber()
  pickupLon!: number;

  @Column("decimal", { precision: 10, scale: 8 })
  @IsNumber()
  dropLat!: number;

  @Column("decimal", { precision: 11, scale: 8 })
  @IsNumber()
  dropLon!: number;

  @Column({
    type: "varchar",
    nullable: true,
  })
  pickupProofUrl?: string;

  @Column({
    type: "varchar",
    nullable: true,
  })
  deliveryProofUrl?: string;

  @Column({
    type: "varchar",
    nullable: true,
  })
  failureCode?: string;

  @Column({
    type: "varchar",
    nullable: true,
  })
  failureReason?: string;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  assignedAt?: Date;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  pickedUpAt?: Date;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  deliveredAt?: Date;

  @Column({
    type: "timestamp",
    nullable: true,
  })
  failedAt?: Date;

  @Column({ name: "expected_pickup_at", type: "timestamp", nullable: true })
  expectedPickupAt?: Date | null;

  @Column({ name: "expected_delivery_at", type: "timestamp", nullable: true })
  expectedDeliveryAt?: Date | null;

  @Column({ name: "sla_breach_at", type: "timestamp", nullable: true })
  slaBreachAt?: Date | null;

  @Column({ name: "delivery_otp", type: "varchar", length: 6, nullable: true })
  deliveryOtp?: string | null;

  @Column({ name: "otp_attempts", type: "int", default: 0 })
  otpAttempts!: number;

  @Column({ name: "otp_locked_until", type: "timestamp", nullable: true })
  otpLockedUntil?: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @OneToMany(() => DeliveryEvent, (event) => event.delivery)
  events!: DeliveryEvent[];
}
