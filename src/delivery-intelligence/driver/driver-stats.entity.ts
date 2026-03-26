import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('driver_stats')
export class DriverStats {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { unique: true })
  driverId: string;

  @Column({ default: 0 })
  totalDeliveries: number;

  @Column({ default: 0 })
  completedDeliveries: number;

  @Column({ default: 0 })
  failedDeliveries: number;

  @Column({ default: 0 })
  cancelledDeliveries: number;

  @Column({ default: 0 })
  acceptanceCount: number;

  @Column({ default: 0 })
  rejectionCount: number;

  @Column({ default: 0 })
  avgDeliveryTimeSeconds: number;

  @Column({ default: 0 })
  avgPickupTimeSeconds: number;

  @Column({ nullable: true })
  lastDeliveryAt: Date;

  @Column({ type: 'numeric', default: 0 })
  reliabilityScore: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}