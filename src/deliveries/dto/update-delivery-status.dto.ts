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
  @IsEnum([
    "DRIVER_REJECTED",
    "DRIVER_OFFLINE",
    "PICKUP_FAILED",
    "DELIVERY_FAILED",
    "TIMEOUT",
    "MANUAL_CANCEL",
    "CANCELLED",
  ])
  failureCode?: string;

  @IsOptional()
  @IsString()
  failureReason?: string;
}
