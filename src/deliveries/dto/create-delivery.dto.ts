import { IsUUID, IsNumber, IsOptional, IsDateString, IsString, IsNotEmpty } from "class-validator";

export class CreateDeliveryDto {
  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
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
