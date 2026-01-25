import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
} from "@nestjs/common";
import { AssignmentService } from "../assignment/assignment.service";
import { ConfigService } from "@nestjs/config";
import { IsUUID, IsNumber, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class PickupLocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lon!: number;
}

class DropLocationDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lon!: number;
}

class SellerOrderReadyPayloadDto {
  @IsUUID()
  sellerOrderId!: string;

  @IsUUID()
  channelId!: string;

  @ValidateNested()
  @Type(() => PickupLocationDto)
  pickup!: PickupLocationDto;

  @ValidateNested()
  @Type(() => DropLocationDto)
  drop!: DropLocationDto;
}

@Controller("events")
export class EventsController {
  private readonly logger = new Logger(EventsController.name);
  private readonly expectedSecret: string | undefined;

  constructor(
    private assignmentService: AssignmentService,
    private configService: ConfigService,
  ) {
    this.expectedSecret = this.configService.get("VENDURE_WEBHOOK_SECRET");
  }

  @Post("seller-order-ready")
  async onSellerOrderReady(
    @Body() payload: SellerOrderReadyPayloadDto,
    @Headers("X-Webhook-Secret") secret: string,
  ) {
    // Validate webhook secret
    if (secret !== this.expectedSecret) {
      this.logger.warn(`Invalid webhook secret received: ${secret}`);
      throw new BadRequestException("Invalid webhook secret");
    }

    this.logger.log(`Received seller order ready: ${payload.sellerOrderId}`);

    try {
      // Create delivery and assign driver (v1: immediate assignment, no acceptance workflow)
      const deliveryId = await this.assignmentService.createAndAssignDelivery(
        payload.sellerOrderId,
        payload.channelId,
        payload.pickup.lat,
        payload.pickup.lon,
        payload.drop.lat,
        payload.drop.lon,
      );

      this.logger.log(
        `Successfully processed seller order ${payload.sellerOrderId}, delivery ID: ${deliveryId}`,
      );

      return {
        status: "success",
        deliveryId,
        message: "Delivery assigned successfully",
      };
    } catch (error) {
      this.logger.error(
        `Failed to process seller order ${payload.sellerOrderId}:`,
        error,
      );
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // ⚠️ V1 RULE: No driver acceptance workflow
  // The assignment-response endpoint has been removed in v1
  // Assignment is immediate and final
}
