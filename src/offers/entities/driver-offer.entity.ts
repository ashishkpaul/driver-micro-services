import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';

@Entity('driver_offers')
export class DriverOffer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  @Index('idx_delivery_pending')
  deliveryId: string;

  @Column('uuid')
  @Index('idx_driver_pending')
  driverId: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'PENDING'
  })
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

  @Column('jsonb')
  offerPayload: {
    pickupLocation: { lat: number; lon: number };
    pickupStoreName: string;
    estimatedPickupTimeMin: number;
    estimatedDeliveryTime: string;
    estimatedDistanceKm: number;
    estimatedEarning: number;
  };

  @CreateDateColumn()
  createdAt: Date;

  @Column('timestamp')
  @Index('idx_expires_at')
  expiresAt: Date;

  @Column('timestamp', { nullable: true })
  acceptedAt: Date;

  @Column('timestamp', { nullable: true })
  rejectedAt: Date;

  @Column('text', { nullable: true })
  rejectionReason: string;

  @Column('timestamp', { nullable: true })
  @Index('idx_created_at')
  notificationSentAt: Date;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'push'
  })
  notificationMethod: 'push' | 'websocket' | 'both';

  @Column('integer', { nullable: true })
  driverResponseTimeMs: number;

  @BeforeInsert()
  setDefaultExpiresAt() {
    if (!this.expiresAt) {
      this.expiresAt = new Date(Date.now() + 30 * 1000); // Default 30 seconds
    }
  }

  @BeforeUpdate()
  updateTimestamps() {
    if (this.status === 'ACCEPTED' && !this.acceptedAt) {
      this.acceptedAt = new Date();
    } else if (this.status === 'REJECTED' && !this.rejectedAt) {
      this.rejectedAt = new Date();
    }
  }
}