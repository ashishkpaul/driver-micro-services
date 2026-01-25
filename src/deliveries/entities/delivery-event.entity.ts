import { 
  Entity, 
  Column, 
  PrimaryGeneratedColumn, 
  CreateDateColumn,
  ManyToOne,
  Index 
} from 'typeorm';
import { Delivery } from './delivery.entity';
import { IsNotEmpty, IsEnum, IsOptional, IsUUID } from 'class-validator';

@Entity('delivery_events')
@Index(['deliveryId', 'eventType'])
@Index(['sellerOrderId'])
export class DeliveryEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @IsUUID()
  deliveryId: string;

  @Column()
  @IsUUID()
  sellerOrderId: string;

  @Column()
  @IsEnum(['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED', 'CANCELLED'])
  eventType: 'ASSIGNED' | 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED' | 'FAILED' | 'CANCELLED';

  @Column({ type: 'jsonb', nullable: true })
  metadata?: any;

  @Column({ nullable: true })
  proofUrl?: string;

  @Column({ nullable: true })
  failureCode?: string;

  @Column({ nullable: true })
  failureReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Delivery, (delivery) => delivery.events, { onDelete: 'CASCADE' })
  delivery: Delivery;
}
