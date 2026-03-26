import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export enum ConfigType {
  SCORING_WEIGHTS = "SCORING_WEIGHTS",
  THRESHOLDS = "THRESHOLDS",
  DECAY_SETTINGS = "DECAY_SETTINGS",
  ROLLOUT_SETTINGS = "ROLLOUT_SETTINGS",
}

export enum ConfigScope {
  GLOBAL = "GLOBAL",
  REGION = "REGION",
  DRIVER_TYPE = "DRIVER_TYPE",
}

@Entity("dispatch_configs")
@Index("idx_dispatch_configs_type", ["configType"])
@Index("idx_dispatch_configs_scope", ["configScope"])
@Index("idx_dispatch_configs_type_scope", ["configType", "configScope"])
export class DispatchConfig {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({
    name: "config_type",
    type: "enum",
    enum: ConfigType,
    enumName: "config_type_enum",
  })
  @IsNotEmpty()
  configType!: ConfigType;

  @Column({
    name: "config_scope",
    type: "enum",
    enum: ConfigScope,
    enumName: "config_scope_enum",
  })
  @IsNotEmpty()
  configScope!: ConfigScope;

  @Column({
    name: "scope_value",
    type: "varchar",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  scopeValue?: string;

  @Column({
    name: "config_key",
    type: "varchar",
  })
  @IsNotEmpty()
  @IsString()
  configKey!: string;

  @Column({
    name: "config_value",
    type: "jsonb",
  })
  @IsNotEmpty()
  configValue: any;

  @Column({
    name: "is_active",
    type: "boolean",
    default: true,
  })
  isActive!: boolean;

  @Column({
    name: "version",
    type: "integer",
    default: 1,
  })
  version!: number;

  @Column({
    name: "description",
    type: "text",
    nullable: true,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;
}