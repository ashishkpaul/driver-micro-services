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
@Index(["sellerOrderId"])
@Index(["status"])
@Index(["driverId"])
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

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => DeliveryEvent, (event) => event.delivery)
  events!: DeliveryEvent[];
}
