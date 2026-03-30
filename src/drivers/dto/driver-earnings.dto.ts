// src/drivers/dto/driver-earnings.dto.ts
import { IsOptional, IsEnum } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export enum EarningsPeriod {
  TODAY = "today",
  WEEK = "week",
  MONTH = "month",
}

export class DriverEarningsQueryDto {
  @ApiPropertyOptional({
    description: "Earnings period filter",
    enum: EarningsPeriod,
    default: EarningsPeriod.TODAY,
  })
  @IsOptional()
  @IsEnum(EarningsPeriod)
  period?: EarningsPeriod = EarningsPeriod.TODAY;
}

export interface DailyEarningsHistory {
  date: string;
  totalDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;
  earnings: number;
}

export interface DriverEarningsResponse {
  period: string;
  totalDeliveries: number;
  completedDeliveries: number;
  failedDeliveries: number;
  totalEarnings: number;
  avgDeliveryTimeMinutes: number;
  history: DailyEarningsHistory[];
}
