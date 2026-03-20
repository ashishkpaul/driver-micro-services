// src/dto/admin-driver-status.dto.ts
import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  Max,
} from "class-validator";
import { DriverStatus } from "../drivers/enums/driver-status.enum";

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

export class AdminDriverListQueryDto {
  @IsOptional()
  @IsUUID()
  cityId?: string;

  @IsOptional()
  @IsUUID()
  zoneId?: string;

  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => {
    if (value === undefined) return value;
    if (typeof value === "boolean") return value;
    return value === "true";
  })
  isActive?: boolean;

  @IsOptional()
  @IsString()
  authProvider?: string;

  @IsOptional()
  @IsString()
  search?: string;

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
