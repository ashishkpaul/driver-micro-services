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

  @Index("idx_admin_users_is_active")
  @Column({
    name: "is_active",
    type: "boolean",
    default: true,
  })
  isActive!: boolean;

  /* ------------------------------------------------------------------ */
  /* Geographic Scoping                                                  */
  /* ------------------------------------------------------------------ */

  @Index("idx_admin_users_city_id")
  @Column({
    name: "city_id",
    type: "uuid",
    nullable: true,
  })
  cityId?: string;

  @ManyToOne(() => City, {
    nullable: true,
    onDelete: "SET NULL",
    onUpdate: "NO ACTION",
  })
  @JoinColumn({
    name: "city_id",
    foreignKeyConstraintName: "fk_admin_users_city",
  })
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

  @Column({
    name: "failed_login_attempts",
    type: "int",
    default: 0,
  })
  failedLoginAttempts!: number;

  @Column({
    name: "locked_until",
    type: "timestamp",
    nullable: true,
  })
  lockedUntil?: Date;

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
   * Check if account is currently locked
   */
  isLocked(): boolean {
    if (!this.lockedUntil) {
      return false;
    }
    return this.lockedUntil > new Date();
  }

  /**
   * Increment failed login attempts and lock if threshold exceeded
   */
  recordFailedLogin(
    maxAttempts: number = 5,
    lockDurationMs: number = 15 * 60 * 1000,
  ): void {
    this.failedLoginAttempts += 1;

    if (this.failedLoginAttempts >= maxAttempts) {
      this.lockedUntil = new Date(Date.now() + lockDurationMs);
    }
  }

  /**
   * Reset failed login attempts on successful login
   */
  resetFailedLoginAttempts(): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = undefined;
  }

  /**
   * Convert to response DTO (exclude sensitive data)
   */
  toResponseDto(): Partial<AdminUser> {
    const { passwordHash, ...result } = this;
    return result;
  }
}
