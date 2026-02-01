import { IsUUID, IsOptional, IsString, IsIn } from 'class-validator';

export class RejectOfferDto {
  @IsUUID()
  offerId: string;

  @IsUUID()
  driverId: string;

  @IsOptional()
  @IsString()
  @IsIn(['too_far', 'no_time', 'bad_area', 'other'])
  reason?: string;
}