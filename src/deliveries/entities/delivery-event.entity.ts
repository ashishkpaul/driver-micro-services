import {
Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
} from "typeorm";
import { Delivery } from "./delivery.entity";
import { IsEnum, IsUUID } from "class-validator";

@Entity({ name: "delivery_events", schema: "public" })
@Index(["deliveryId", "eventType"])
@Index(["sellerOrderId"])
export class DeliveryEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "delivery_id" })
  @IsUUID()
  deliveryId!: string;

  @Column()
  @IsUUID()
  sellerOrderId!: string;

  @Column()
  @IsEnum([
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ])
  eventType!:
    | "ASSIGNED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED";

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;

  @Column({ nullable: true })
  proofUrl?: string;

  @Column({ nullable: true })
  failureCode?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @CreateDateColumn()
  createdAt!: Date;

  @ManyToOne(() => Delivery, (delivery) => delivery.events, {
    onDelete: "CASCADE",
  })
  delivery!: Delivery;
}
