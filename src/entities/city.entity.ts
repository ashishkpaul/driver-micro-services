// src/entities/city.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { IsString, IsNotEmpty } from 'class-validator';
import { Point } from 'geojson';
import { Zone } from './zone.entity';
import { AdminUser } from './admin-user.entity';

@Entity('cities')
export class City {
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
  code!: string; // e.g., "BNG", "DEL", "MUM"

  /* ------------------------------------------------------------------ */
  /* Geographic Information                                              */
  /* ------------------------------------------------------------------ */

  @Column({ type: 'point', spatialFeatureType: 'Point', nullable: true })
  @IsNotEmpty()
  center?: Point; // Geographic center of the city

  /* ------------------------------------------------------------------ */
  /* Timestamps                                                         */
  /* ------------------------------------------------------------------ */

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /* ------------------------------------------------------------------ */
  /* Relationships                                                      */
  /* ------------------------------------------------------------------ */

  @OneToMany(() => Zone, zone => zone.city)
  zones?: Zone[];

  @OneToMany(() => AdminUser, admin => admin.city)
  admins?: AdminUser[];

  /* ------------------------------------------------------------------ */
  /* Helper Methods                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Convert to response DTO
   */
  toResponseDto(): Partial<City> {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      center: this.center,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}