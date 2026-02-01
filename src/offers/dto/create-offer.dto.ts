import { IsUUID, IsOptional, IsInt, Min, Max } from 'class-validator';

export class CreateOfferDto {
  @IsUUID()
  driverId: string;

  @IsUUID()
  deliveryId: string;

  @IsOptional()
  @IsInt()
  @Min(10)
  @Max(120)
  expiresInSeconds?: number;
}
