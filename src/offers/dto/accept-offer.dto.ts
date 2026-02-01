import { IsUUID, IsISO8601 } from 'class-validator';

export class AcceptOfferDto {
  @IsUUID()
  offerId: string;

  @IsUUID()
  driverId: string;

  @IsISO8601()
  acceptedAt: string;
}