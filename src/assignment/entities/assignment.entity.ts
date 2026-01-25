import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

@Entity('assignments')
@Index(['sellerOrderId', 'driverId'])
export class Assignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  sellerOrderId: string;

  @Column()
  channelId: string;

  @Column()
  driverId: string;

  @Column({ default: 'PENDING' })
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distanceToPickup?: number; // in km

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  distancePickupToDrop?: number; // in km

  @Column({ nullable: true })
  rejectionReason?: string;

  @Column({ nullable: true })
  expiresAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
