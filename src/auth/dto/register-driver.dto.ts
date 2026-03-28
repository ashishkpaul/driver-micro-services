import { IsString, IsPhoneNumber, IsOptional, IsUUID } from "class-validator";

export class RegisterDriverDto {
  @IsString()
  name!: string;

  @IsPhoneNumber("IN")
  phone!: string;

  @IsUUID("all")
  cityId!: string;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
