import { IsOptional, IsString, Length, IsNumber } from "class-validator";

export class VerifyDeliveryOtpDto {
  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsOptional()
  @IsString()
  proofUrl?: string;

  @IsOptional()
  @IsNumber()
  driverLat?: number;

  @IsOptional()
  @IsNumber()
  driverLon?: number;
}
