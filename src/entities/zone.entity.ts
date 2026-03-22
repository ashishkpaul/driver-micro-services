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
} from "typeorm";
import { IsString, IsNotEmpty } from "class-validator";
import { Polygon } from "geojson";
import { City } from "./city.entity";

@Entity("zones")
export class Zone {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /* ------------------------------------------------------------------ */
  /* Basic Information                                                   */
  /* ------------------------------------------------------------------ */

  @Column({ type: "varchar" })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @Column({ type: "varchar", unique: true }) // 👈 ADDED: unique: true
  @IsString()
  @IsNotEmpty()
  code!: string; // e.g., "NORTH-BNG", "SOUTH-BNG"

  /* ------------------------------------------------------------------ */
  /* Geographic Information                                              */
  /* ------------------------------------------------------------------ */

  @Index("idx_zones_city_id") // Add explicit index name
  @Column({ name: "city_id", type: "uuid" })
  @IsNotEmpty()
  cityId!: string;

  @ManyToOne(() => City, {
    onDelete: "RESTRICT",
    onUpdate: "NO ACTION",
  })
  @JoinColumn({
    name: "city_id",
    foreignKeyConstraintName: "fk_zones_city",
  })
  city!: City;

  @Column({
    type: "polygon",
    nullable: true,
  })
  @IsNotEmpty()
  boundary?: string;

  /* ------------------------------------------------------------------ */
  /* Timestamps                                                         */
  /* ------------------------------------------------------------------ */

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
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
