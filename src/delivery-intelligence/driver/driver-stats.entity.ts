import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('driver_stats')
export class DriverStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'driver_id', unique: true })
  driverId: string;

  @Column({ name: 'total_deliveries', default: 0, nullable: true })
  totalDeliveries: number;

  @Column({ name: 'completed_deliveries', default: 0, nullable: true })
  completedDeliveries: number;

  @Column({ name: 'failed_deliveries', default: 0, nullable: true })
  failedDeliveries: number;

  @Column({ name: 'cancelled_deliveries', default: 0, nullable: true })
  cancelledDeliveries: number;

  @Column({ name: 'acceptance_count', default: 0, nullable: true })
  acceptanceCount: number;

  @Column({ name: 'rejection_count', default: 0, nullable: true })
  rejectionCount: number;

  @Column({ name: 'avg_delivery_time_seconds', default: 0, nullable: true })
  avgDeliveryTimeSeconds: number;

  @Column({ name: 'avg_pickup_time_seconds', default: 0, nullable: true })
  avgPickupTimeSeconds: number;

  @Column({ name: 'last_delivery_at', nullable: true })
  lastDeliveryAt: Date;

  @Column({ name: 'reliability_score', type: 'numeric', default: 0, nullable: true })
  reliabilityScore: number;

  @CreateDateColumn({ name: 'created_at', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date;
}