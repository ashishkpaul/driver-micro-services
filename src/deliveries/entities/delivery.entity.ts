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

@Entity("deliveries")
@Index(["sellerOrderId"], { unique: true })
@Index(["status"])
@Index(["driverId"])
@Index("idx_deliveries_status_driver", ["status", "driverId"])
@Index(["expectedPickupAt"])
@Index(["expectedDeliveryAt"])
@Index(["slaBreachAt"])
export class Delivery {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  @IsNotEmpty()
  @IsUUID()
  sellerOrderId!: string;

  @Column()
  @IsNotEmpty()
  @IsUUID()
  channelId!: string;

  @Column({ nullable: true })
  @IsUUID()
  @IsOptional()
  driverId?: string;

  @Column({ default: "PENDING" })
  @IsEnum([
    "PENDING",
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ])
  status!:
    | "PENDING"
    | "ASSIGNED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED";

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

  @Column({ nullable: true })
  pickupProofUrl?: string;

  @Column({ nullable: true })
  deliveryProofUrl?: string;

  @Column({ nullable: true })
  failureCode?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @Column({ nullable: true })
  assignedAt?: Date;

  @Column({ nullable: true })
  pickedUpAt?: Date;

  @Column({ nullable: true })
  deliveredAt?: Date;

  @Column({ nullable: true })
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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => DeliveryEvent, (event) => event.delivery)
  events!: DeliveryEvent[];
}
