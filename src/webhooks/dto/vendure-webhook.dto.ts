import {
  IsEnum,
  IsString,
  IsUUID,
  IsOptional,
  IsObject,
  IsNumber,
} from 'class-validator';


export class DeliveryAssignedDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
  channelId!: string;

  @IsUUID()
  driverId!: string;

  @IsUUID()
  assignmentId!: string;

  @IsString()
  assignedAt!: string;
}

export class DeliveryPickedUpDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
  channelId!: string;

  @IsString()
  pickupProofUrl!: string;

  @IsOptional()
  @IsString()
  pickedUpAt?: string;
}

export class DeliveryDeliveredDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
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
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
  channelId!: string;

  @IsObject()
  failure!: {
    code: 'DRIVER_REJECTED' | 'DRIVER_OFFLINE' | 'PICKUP_FAILED' | 'DELIVERY_FAILED' | 'TIMEOUT' | 'MANUAL_CANCEL';
    reason: string;
    occurredAt: string;
  };
}
