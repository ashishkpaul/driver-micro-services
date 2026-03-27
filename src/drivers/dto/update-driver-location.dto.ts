import { IsNumber, Min, Max, ValidateIf } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateDriverLocationDto {
  @ApiProperty({ description: "Latitude" })
  @IsNumber()
  @Min(-90)
  @Max(90)
  @ValidateIf((o) => o.lat !== 0 || o.lon !== 0, {
    message: "Coordinates cannot be exactly 0,0",
  })
  lat!: number;

  @ApiProperty({ description: "Longitude" })
  @IsNumber()
  @Min(-180)
  @Max(180)
  @ValidateIf((o) => o.lat !== 0 || o.lon !== 0, {
    message: "Coordinates cannot be exactly 0,0",
  })
  lon!: number;
}
