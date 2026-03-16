import { IsOptional, IsString, Length } from "class-validator";

export class VerifyDeliveryOtpDto {
  @IsString()
  @Length(6, 6)
  otp!: string;

  @IsOptional()
  @IsString()
  proofUrl?: string;
}
