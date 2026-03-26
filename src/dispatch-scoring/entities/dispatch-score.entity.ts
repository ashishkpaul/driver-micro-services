import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { IsNotEmpty, IsUUID, IsNumber, IsOptional } from "class-validator";

export enum ScoreType {
  OVERALL = "OVERALL",
  COMPLETION_RATE = "COMPLETION_RATE",
  TIMING = "TIMING",
  QUALITY = "QUALITY",
}

export enum ScoreSource {
  DRIVER_STATS = "DRIVER_STATS",
  DELIVERY_METRICS = "DELIVERY_METRICS",
  MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT",
}

@Entity("dispatch_scores")
@Index("idx_dispatch_scores_driver_id", ["driverId"])
@Index("idx_dispatch_scores_type", ["scoreType"])
@Index("idx_dispatch_scores_driver_type", ["driverId", "scoreType"])
@Index("idx_dispatch_scores_created_at", ["createdAt"])
export class DispatchScore {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "uuid" })
  @IsNotEmpty()
  @IsUUID()
  driverId!: string;

  @Column({
    name: "score_type",
    type: "enum",
    enum: ScoreType,
    enumName: "dispatch_scores_score_type_enum",
  })
  @IsNotEmpty()
  scoreType!: ScoreType;

  @Column({ type: "decimal", precision: 5, scale: 2 })
  @IsNumber()
  score!: number;

  @Column({
    name: "score_source",
    type: "enum",
    enum: ScoreSource,
    enumName: "dispatch_scores_score_source_enum",
  })
  @IsNotEmpty()
  scoreSource!: ScoreSource;

  @Column({
    name: "weight_factor",
    type: "decimal",
    precision: 3,
    scale: 2,
    default: 1.0,
  })
  @IsNumber()
  weightFactor!: number;

  @Column({
    name: "decay_factor",
    type: "decimal",
    precision: 3,
    scale: 2,
    default: 1.0,
  })
  @IsNumber()
  decayFactor!: number;

  @Column({
    name: "last_calculated_at",
    type: "timestamp",
  })
  lastCalculatedAt!: Date;

  @Column({
    name: "valid_until",
    type: "timestamp",
  })
  validUntil!: Date;

  @Column({
    type: "jsonb",
    nullable: true,
  })
  metadata?: Record<string, any>;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}