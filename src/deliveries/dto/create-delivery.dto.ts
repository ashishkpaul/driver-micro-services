import { IsUUID, IsNumber, IsOptional, IsDateString } from "class-validator";

export class CreateDeliveryDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
  channelId!: string;

  @IsNumber()
  pickupLat!: number;

  @IsNumber()
  pickupLon!: number;

  @IsNumber()
  dropLat!: number;

  @IsNumber()
  dropLon!: number;

  @IsOptional()
  @IsDateString()
  expectedPickupAt?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryAt?: string;
}
