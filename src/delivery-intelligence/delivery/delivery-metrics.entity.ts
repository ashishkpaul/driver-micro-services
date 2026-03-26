import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_metrics')
export class DeliveryMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'delivery_id', unique: true })
  deliveryId: string;

  @Column({ name: 'seller_order_id' })
  sellerOrderId: string;

  @Column('uuid', { name: 'driver_id', nullable: true })
  driverId: string;

  @Column('uuid', { name: 'zone_id', nullable: true })
  zoneId: string;

  @Column({ name: 'assigned_at', nullable: true })
  assignedAt: Date;

  @Column({ name: 'picked_up_at', nullable: true })
  pickedUpAt: Date;

  @Column({ name: 'delivered_at', nullable: true })
  deliveredAt: Date;

  @Column({ name: 'failed_at', nullable: true })
  failedAt: Date;

  @Column({ name: 'assignment_time_seconds', default: 0, nullable: true })
  assignmentTimeSeconds: number;

  @Column({ name: 'pickup_time_seconds', default: 0, nullable: true })
  pickupTimeSeconds: number;

  @Column({ name: 'in_transit_time_seconds', default: 0, nullable: true })
  inTransitTimeSeconds: number;

  @Column({ name: 'total_time_seconds', default: 0, nullable: true })
  totalTimeSeconds: number;

  @Column({ name: 'retry_count', default: 0, nullable: true })
  retryCount: number;

  @Column({ name: 'reassignment_count', default: 0, nullable: true })
  reassignmentCount: number;

  @Column({ name: 'sla_breached', default: false, nullable: true })
  slaBreached: boolean;

  @CreateDateColumn({ name: 'created_at', nullable: true })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt: Date;
}