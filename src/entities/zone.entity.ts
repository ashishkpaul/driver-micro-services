// src/entities/zone.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { IsString, IsNotEmpty } from 'class-validator';
import { Polygon } from 'geojson';
import { City } from './city.entity';

@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /* ------------------------------------------------------------------ */
  /* Basic Information                                                   */
  /* ------------------------------------------------------------------ */

  @Column()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Column()
  @IsString()
  @IsNotEmpty()
  code!: string; // e.g., "NORTH-BNG", "SOUTH-BNG"

  /* ------------------------------------------------------------------ */
  /* Geographic Information                                              */
  /* ------------------------------------------------------------------ */

  @Column({ name: 'city_id' })
  @IsNotEmpty()
  cityId!: string;

  @ManyToOne(() => City, { nullable: false })
  @JoinColumn({ name: 'city_id' })
  city!: City;

  @Column({ type: 'polygon', spatialFeatureType: 'Polygon', nullable: true })
  @IsNotEmpty()
  boundary?: Polygon; // Geographic boundary of the zone

  /* ------------------------------------------------------------------ */
  /* Timestamps                                                         */
  /* ------------------------------------------------------------------ */

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /* ------------------------------------------------------------------ */
  /* Helper Methods                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Convert to response DTO
   */
  toResponseDto(): Partial<Zone> {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      cityId: this.cityId,
      boundary: this.boundary,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}