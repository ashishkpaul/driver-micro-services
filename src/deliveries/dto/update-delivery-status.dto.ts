import { IsEnum, IsOptional, IsString } from "class-validator";

export class UpdateDeliveryStatusDto {
  @IsEnum([
    "ASSIGNED",
    "PICKED_UP",
    "IN_TRANSIT",
    "DELIVERED",
    "FAILED",
    "CANCELLED",
  ])
  status!:
    | "ASSIGNED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "DELIVERED"
    | "FAILED"
    | "CANCELLED";

  @IsOptional()
  @IsString()
  proofUrl?: string;

  @IsOptional()
  @IsString()
  failureCode?: string;

  @IsOptional()
  @IsString()
  failureReason?: string;
}
