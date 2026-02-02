import {
  IsString,
  IsPhoneNumber,
  IsOptional,
  IsBoolean,
  IsUUID,
} from "class-validator";

export class CreateDriverDto {
  @IsString()
  name!: string;

  @IsPhoneNumber("IN")
  phone!: string;

  @IsUUID("all")
  cityId!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  vehicleType?: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
