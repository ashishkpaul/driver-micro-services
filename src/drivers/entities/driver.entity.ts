// src/drivers/entities/driver.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import {
  IsNotEmpty,
  IsPhoneNumber,
  IsBoolean,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from "class-validator";
import { DriverStatus } from "../enums/driver-status.enum";
import { DriverRegistrationStatus } from "../enums/driver-registration-status.enum";

@Entity("drivers")
@Index("idx_drivers_status", ["status"])
@Index("idx_drivers_city_id", ["cityId"])
@Index("idx_drivers_zone_id", ["zoneId"])
@Index("idx_drivers_status_city", ["status", "cityId"])
@Index("idx_drivers_status_zone", ["status", "zoneId"])
export class Driver {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar" })
  name!: string;

  @Column({ type: "varchar", unique: true, nullable: true })
  phone?: string;

  @Index("idx_drivers_is_active")
  @Column({ name: "is_active", type: "boolean", default: true })
  isActive!: boolean;

  // @Index("idx_drivers_status")
  @Column({
    type: "enum",
    enum: DriverStatus,
    enumName: "driver_status_enum",
    default: DriverStatus.AVAILABLE,
  })
  status!: DriverStatus;

  @Column({
    name: "current_lat",
    type: "numeric",
    precision: 10,
    scale: 8,
    nullable: true,
  })
  currentLat?: number;

  @Column({
    name: "current_lon",
    type: "numeric",
    precision: 10,
    scale: 8,
    nullable: true,
  })
  currentLon?: number;

  @Column({
    name: "last_lat",
    type: "numeric",
    precision: 10,
    scale: 8,
    nullable: true,
  })
  lastLat?: number;

  @Column({
    name: "last_lon",
    type: "numeric",
    precision: 10,
    scale: 8,
    nullable: true,
  })
  lastLon?: number;

  @Column({
    name: "city_id",
    type: "uuid",
    nullable: true,
  })
  cityId?: string;

  @Column({
    name: "zone_id",
    type: "uuid",
    nullable: true,
  })
  zoneId?: string;

  @Column({
    name: "vehicle_type",
    type: "varchar",
    nullable: true,
  })
  vehicleType?: string;

  @Column({
    name: "vehicle_number",
    type: "varchar",
    nullable: true,
  })
  vehicleNumber?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({
    name: "last_active_at",
    type: "timestamp",
    nullable: true,
  })
  lastActiveAt?: Date;

  @Column({
    type: "varchar",
    nullable: true,
  })
  email?: string;

  @Column({
    name: "google_sub",
    type: "varchar",
    nullable: true,
  })
  googleSub?: string;

  @Column({
    name: "auth_provider",
    type: "enum",
    enum: ["legacy", "google", "email"],
    enumName: "auth_provider_enum",
    default: "legacy",
  })
  authProvider!: "legacy" | "google" | "email";

  @Column({
    name: "last_location_update_at",
    type: "timestamp",
    nullable: true,
  })
  lastLocationUpdateAt?: Date;

  @Column({
    name: "last_status_update_at",
    type: "timestamp",
    nullable: true,
  })
  lastStatusUpdateAt?: Date;

  @Column({
    type: "enum",
    enum: DriverRegistrationStatus,
    default: DriverRegistrationStatus.PROFILE_INCOMPLETE,
  })
  registrationStatus!: DriverRegistrationStatus;

  @Column({
    name: "approved_at",
    type: "timestamp",
    nullable: true,
  })
  approvedAt?: Date;

  @Column({
    name: "approved_by_id",
    type: "uuid",
    nullable: true,
  })
  approvedById?: string;

  @Column({
    name: "rejection_reason",
    type: "varchar",
    nullable: true,
  })
  rejectionReason?: string;
}
