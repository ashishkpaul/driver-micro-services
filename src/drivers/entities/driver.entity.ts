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

@Entity("drivers")
@Index("idx_drivers_status_city", ["status", "cityId"])
@Index("idx_drivers_status_zone", ["status", "zoneId"])
export class Driver {

@PrimaryGeneratedColumn("uuid")
id!: string;

@Column({ type: "varchar" })
name!: string;

@Column({ type: "varchar", unique: true })
phone!: string;

@Index("idx_drivers_is_active")
@Column({ name: "is_active", type: "boolean", default: true })
isActive!: boolean;

@Index()
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
  nullable: true,
})
currentLat?: number;

@Column({
  name: "current_lon",
  type: "numeric",
  nullable: true,
})
currentLon?: number;

@Column({
  name: "city_id",
  type: "uuid",
})
cityId!: string;

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
  type: "varchar",
  default: "legacy",
})
authProvider!: "legacy" | "google" | "email";

}