// src/dto/admin.dto.ts
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Role } from '../auth/roles.enum';

export class CreateAdminDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(Role)
  role!: Role;

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
  @IsEnum(Role)
  role?: Role;

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
  role!: Role;
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
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  skip?: number;

  @IsOptional()
  take?: number;
}