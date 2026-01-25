import { IsString, IsPhoneNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsPhoneNumber()
  phone: string;

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
