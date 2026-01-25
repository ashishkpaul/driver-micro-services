import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { IsNotEmpty, IsPhoneNumber, IsBoolean, IsOptional, IsNumber, Min, Max } from 'class-validator';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @IsNotEmpty()
  name: string;

  @Column({ unique: true })
  @IsPhoneNumber()
  phone: string;

  @Column({ default: true })
  @IsBoolean()
  isActive: boolean;

  @Column({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  currentLat?: number;

  @Column({ nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  currentLon?: number;

  @Index()
  @Column({ default: 'AVAILABLE' })
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';

  @Column({ nullable: true })
  vehicleType?: string;

  @Column({ nullable: true })
  vehicleNumber?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ nullable: true })
  lastActiveAt?: Date;
}
