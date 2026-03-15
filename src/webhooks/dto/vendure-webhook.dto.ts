import {
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsNumber,
  IsNotEmpty,
} from "class-validator";

export class DeliveryAssignedDto {
  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
  channelId!: string;

  @IsUUID()
  driverId!: string;

  @IsUUID()
  assignmentId!: string;

  @IsString()
  assignedAt!: string;
}

export class DeliveryPickedUpDto {
  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
  channelId!: string;

  @IsString()
  pickupProofUrl!: string;

  @IsOptional()
  @IsString()
  pickedUpAt?: string;
}

export class DeliveryDeliveredDto {
  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
  channelId!: string;

  @IsString()
  deliveryProofUrl!: string;

  @IsOptional()
  @IsNumber()
  deliveryLat?: number;

  @IsOptional()
  @IsNumber()
  deliveryLon?: number;

  @IsOptional()
  @IsString()
  deliveredAt?: string;
}

export class DeliveryFailedDto {
  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
  channelId!: string;

  @IsObject()
  failure!: {
    code:
      | "DRIVER_REJECTED"
      | "DRIVER_OFFLINE"
      | "PICKUP_FAILED"
      | "DELIVERY_FAILED"
      | "TIMEOUT"
      | "MANUAL_CANCEL";
    reason: string;
    occurredAt: string;
  };

  @IsOptional()
  @IsString()
  cancelledAt?: string;
}
