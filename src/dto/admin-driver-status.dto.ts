// src/dto/admin-driver-status.dto.ts
import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class AdminUpdateDriverStatusDto {
  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdminBulkUpdateDriverStatusDto {
  @IsUUID(4, { each: true })
  driverIds: string[];

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsString()
  reason?: string;
}