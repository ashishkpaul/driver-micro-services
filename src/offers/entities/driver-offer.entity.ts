import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from "typeorm";

export enum DriverOfferStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
  EXPIRED = "EXPIRED",
}

export enum NotificationMethod {
  PUSH = "push",
  WEBSOCKET = "websocket",
  BOTH = "both",
}

@Entity("driver_offers")
export class DriverOffer {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "uuid",
  })
  @Index("idx_delivery_pending")
  deliveryId: string;

  @Column({
    type: "uuid",
  })
  @Index("idx_driver_pending")
  driverId: string;

  @Column({
    type: "enum",
    enum: DriverOfferStatus,
    enumName: "driver_offer_status_enum",
    default: DriverOfferStatus.PENDING,
  })
  status: DriverOfferStatus;

  @Column("jsonb")
  offerPayload: {
    pickupLocation: { lat: number; lon: number };
    pickupStoreName: string;
    estimatedPickupTimeMin: number;
    estimatedDeliveryTime: string;
    estimatedDistanceKm: number;
    estimatedEarning: number;
  };

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @Column({
    name: "expires_at",
    type: "timestamp",
  })
  @Index("idx_expires_at")
  expiresAt: Date;

  @Column({
    name: "accepted_at",
    type: "timestamp",
    nullable: true,
  })
  acceptedAt: Date;

  @Column({
    name: "rejected_at",
    type: "timestamp",
    nullable: true,
  })
  rejectedAt: Date;

  @Column({
    name: "rejection_reason",
    type: "text",
    nullable: true,
  })
  rejectionReason: string;

  @Column({
    name: "notification_sent_at",
    type: "timestamp",
    nullable: true,
  })
  @Index("idx_created_at")
  notificationSentAt: Date;

  @Column({
    name: "notification_method",
    type: "enum",
    enum: NotificationMethod,
    enumName: "notification_method_enum",
    default: NotificationMethod.PUSH,
  })
  notificationMethod: NotificationMethod;

  @Column({
    name: "driver_response_time_ms",
    type: "integer",
    nullable: true,
  })
  driverResponseTimeMs: number;

  @BeforeInsert()
  setDefaultExpiresAt() {
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + 30 * 1000); // Default 30 seconds
    }
  }

  @BeforeUpdate()
  updateTimestamps() {
    if (this.status === "ACCEPTED" && !this.acceptedAt) {
      this.acceptedAt = new Date();
    } else if (this.status === "REJECTED" && !this.rejectedAt) {
      this.rejectedAt = new Date();
    }
  }
}
