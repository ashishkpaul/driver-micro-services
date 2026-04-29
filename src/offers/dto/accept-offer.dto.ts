import { IsUUID, IsISO8601, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AcceptOfferDto {
  @ApiProperty({ example: "offer-id-123" })
  @IsOptional()
  @IsUUID()
  offerId?: string;

  @ApiProperty({ example: "driver-id-123" })
  @IsOptional()
  @IsUUID()
  driverId?: string;

  @ApiProperty({ example: new Date().toISOString() })
  @IsISO8601()
  acceptedAt: string;
}
