import { ApiProperty } from "@nestjs/swagger";
import { IsString, IsNotEmpty, IsOptional } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "driver_123", description: "Driver identifier" })
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: "eyJhbGciOiJIUzI1Ni..." })
  accessToken!: string;

  @ApiProperty({ example: "driver_123" })
  driverId!: string;

  @ApiProperty({ example: "ACTIVE" })
  status!: string;
}
