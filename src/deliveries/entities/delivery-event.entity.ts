import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  Index,
  JoinColumn,
} from "typeorm";
import { Delivery } from "./delivery.entity";
import { IsEnum, IsUUID } from "class-validator";

export enum DeliveryEventType {
  ASSIGNED = "ASSIGNED",
  PICKED_UP = "PICKED_UP",
  IN_TRANSIT = "IN_TRANSIT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
}

@Entity({ name: "delivery_events", schema: "public" })
@Index("idx_delivery_events_delivery_event", ["deliveryId", "eventType"])
@Index("idx_delivery_events_seller_order_id", ["sellerOrderId"])
export class DeliveryEvent {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
    name: "delivery_id",
    type: "uuid",
  })
  @IsUUID()
  deliveryId!: string;

  @Column({ type: "uuid" })
  @IsUUID()
  sellerOrderId!: string;

  @Column({
    type: "enum",
    enum: DeliveryEventType,
    enumName: "delivery_event_type_enum",
  })
  @IsEnum(DeliveryEventType)
  eventType!: DeliveryEventType;

  @Column({ type: "jsonb", nullable: true })
  metadata?: Record<string, unknown>;

  @Column({
    type: "varchar",
    nullable: true,
  })
  proofUrl?: string;

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

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @ManyToOne(() => Delivery, (delivery) => delivery.events, {
    onDelete: "CASCADE",
    onUpdate: "NO ACTION",
  })
  @JoinColumn({
    name: "delivery_id",
    foreignKeyConstraintName: "fk_delivery_events_delivery",
  })
  delivery!: Delivery;
}
