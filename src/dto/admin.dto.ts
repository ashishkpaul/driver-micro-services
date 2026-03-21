// src/dto/admin.dto.ts
import { Transform } from "class-transformer";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  Min,
  Max,
} from "class-validator";
import { Role } from "../auth/roles.enum";
import { AdminRole } from "../entities/admin-user.entity";

export class CreateAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(AdminRole)
  role!: AdminRole;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  createdById?: string;
}

export class UpdateAdminDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  isActive?: boolean;
}

export class AdminLoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class AdminResponseDto {
  id!: string;
  email!: string;
  role!: AdminRole;
  isActive!: boolean;
  cityId?: string;
  lastLoginAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}

export class AdminListQueryDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsEnum(AdminRole)
  role?: AdminRole;

  @IsOptional()
  @Min(0)
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  skip?: number;

  @IsOptional()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  take?: number;
}
