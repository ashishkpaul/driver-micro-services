import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import {
  IsNotEmpty,
  IsPhoneNumber,
  IsBoolean,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from "class-validator";

@Entity("drivers")
export class Driver {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column()
  @IsNotEmpty()
  name!: string;

  @Column({ unique: true })
  @IsPhoneNumber()
  phone!: string;

  @Column({ name: "is_active", default: true })
  @IsBoolean()
  isActive!: boolean;

  @Column({ name: "current_lat", nullable: true, type: "numeric" })
  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  currentLat?: number;

  @Column({ name: "current_lon", nullable: true, type: "numeric" })
  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  currentLon?: number;

  @Index()
  @Column({ default: "AVAILABLE" })
  status!: "AVAILABLE" | "BUSY" | "OFFLINE";

  @Column({ name: "vehicle_type", nullable: true })
  vehicleType?: string;

  @Column({ name: "vehicle_number", nullable: true })
  vehicleNumber?: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  @Column({ name: "last_active_at", nullable: true })
  lastActiveAt?: Date;
}
