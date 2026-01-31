// src/drivers/entities/driver.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  IsNotEmpty,
  IsPhoneNumber,
  IsBoolean,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { DriverStatus } from '../enums/driver-status.enum';

@Entity('drivers')
export class Driver {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /* ------------------------------------------------------------------ */
  /* Identity                                                            */
  /* ------------------------------------------------------------------ */

  @Column()
  @IsNotEmpty()
  name!: string;

  @Column({ unique: true })
  @IsPhoneNumber('IN')
  phone!: string;

  /* ------------------------------------------------------------------ */
  /* Admin control flags                                                  */
  /* ------------------------------------------------------------------ */

  /**
   * HARD enable / disable flag
   * - false → cannot login
   * - false → cannot receive assignments
   * - controlled ONLY by admin APIs
   */
  @Index()
  @Column({ name: 'is_active', default: true })
  @IsBoolean()
  isActive!: boolean;

  /* ------------------------------------------------------------------ */
  /* Driver lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  @Index()
  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.AVAILABLE,
  })
  status!: DriverStatus;

  /* ------------------------------------------------------------------ */
  /* Geo / availability                                                   */
  /* ------------------------------------------------------------------ */

  @Column({ name: 'current_lat', type: 'numeric', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  currentLat?: number;

  @Column({ name: 'current_lon', type: 'numeric', nullable: true })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  currentLon?: number;

  /* ------------------------------------------------------------------ */
  /* Multi-city / zone scoping                                            */
  /* ------------------------------------------------------------------ */

  @Index()
  @Column({ name: 'city_id' })
  cityId!: string;

  @Index()
  @Column({ name: 'zone_id', nullable: true })
  zoneId?: string;

  /* ------------------------------------------------------------------ */
  /* Vehicle info                                                         */
  /* ------------------------------------------------------------------ */

  @Column({ name: 'vehicle_type', nullable: true })
  vehicleType?: string;

  @Column({ name: 'vehicle_number', nullable: true })
  vehicleNumber?: string;

  /* ------------------------------------------------------------------ */
  /* Timestamps                                                          */
  /* ------------------------------------------------------------------ */

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'last_active_at', nullable: true })
  lastActiveAt?: Date;
}
