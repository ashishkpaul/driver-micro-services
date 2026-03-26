import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('delivery_metrics')
export class DeliveryMetrics {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  deliveryId: string;

  @Column()
  sellerOrderId: string;

  @Column({ nullable: true })
  driverId: string;

  @Column({ nullable: true })
  zoneId: string;

  @Column({ nullable: true })
  assignedAt: Date;

  @Column({ nullable: true })
  pickedUpAt: Date;

  @Column({ nullable: true })
  deliveredAt: Date;

  @Column({ nullable: true })
  failedAt: Date;

  @Column({ default: 0 })
  assignmentTimeSeconds: number;

  @Column({ default: 0 })
  pickupTimeSeconds: number;

  @Column({ default: 0 })
  inTransitTimeSeconds: number;

  @Column({ default: 0 })
  totalTimeSeconds: number;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ default: 0 })
  reassignmentCount: number;

  @Column({ default: false })
  slaBreached: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}