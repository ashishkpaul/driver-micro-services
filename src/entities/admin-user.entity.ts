// src/entities/admin-user.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from "typeorm";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { Role } from "../auth/roles.enum";

export enum AdminRole {
  DRIVER = "DRIVER",
  ADMIN = "ADMIN",
  DISPATCHER = "DISPATCHER",
  OPS_ADMIN = "OPS_ADMIN",
  CITY_ADMIN = "CITY_ADMIN",
  SUPER_ADMIN = "SUPER_ADMIN",
  SYSTEM = "SYSTEM",
}
import { City } from "./city.entity";

@Entity("admin_users")
export class AdminUser {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  /* ------------------------------------------------------------------ */
  /* Identity & Authentication                                           */
  /* ------------------------------------------------------------------ */

  @Column({ unique: true })
  @IsEmail()
  email!: string;

  @Column({ name: "password_hash" })
  @IsString()
  @MinLength(8)
  passwordHash!: string;

  @Column({
    type: "enum",
    enum: AdminRole,
    enumName: "admin_role_enum",
    default: AdminRole.ADMIN,
  })
  @IsEnum(AdminRole)
  role!: AdminRole;

  /* ------------------------------------------------------------------ */
  /* Admin Control Flags                                                 */
  /* ------------------------------------------------------------------ */

  @Index()
  @Column({ name: "is_active", default: true })
  isActive!: boolean;

  /* ------------------------------------------------------------------ */
  /* Geographic Scoping                                                  */
  /* ------------------------------------------------------------------ */

  @Index()
  @Column({
    name: "city_id",
    type: "uuid",
    nullable: true,
  })
  cityId?: string;

  @ManyToOne(() => City, { nullable: true })
  @JoinColumn({ name: "city_id" })
  city?: City;

  /* ------------------------------------------------------------------ */
  /* Audit & Tracking                                                   */
  /* ------------------------------------------------------------------ */

  @Column({
    name: "created_by_id",
    type: "uuid",
    nullable: true,
  })
  createdById?: string;

  @Column({
    name: "last_login_at",
    type: "timestamp",
    nullable: true,
  })
  lastLoginAt?: Date;

  @CreateDateColumn({ name: "created_at" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt!: Date;

  /* ------------------------------------------------------------------ */
  /* Helper Methods                                                     */
  /* ------------------------------------------------------------------ */

  /**
   * Check if user is superadmin
   */
  isSuperAdmin(): boolean {
    return this.role === AdminRole.SUPER_ADMIN;
  }

  /**
   * Check if user is admin (includes superadmin)
   */
  isAdmin(): boolean {
    return [AdminRole.ADMIN, AdminRole.SUPER_ADMIN].includes(this.role);
  }

  /**
   * Check if user can access a specific city
   */
  canAccessCity(cityId: string): boolean {
    // Superadmin can access all cities
    if (this.isSuperAdmin()) {
      return true;
    }

    // Admin can only access their assigned city
    return this.cityId === cityId;
  }

  /**
   * Convert to response DTO (exclude sensitive data)
   */
  toResponseDto(): Partial<AdminUser> {
    const { passwordHash, ...result } = this;
    return result;
  }
}
