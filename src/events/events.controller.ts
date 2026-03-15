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
import { IsNumber, ValidateNested, IsString, IsNotEmpty } from "class-validator";
import { Type } from "class-transformer";
import { RedisService } from "../redis/redis.service";

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
  @IsString()
  @IsNotEmpty()
  eventId!: string;

  @IsString()
  @IsNotEmpty()
  sellerOrderId!: string;

  @IsString()
  @IsNotEmpty()
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
  private readonly eventIdTtlSeconds = 60 * 60 * 24;

  constructor(
    private assignmentService: AssignmentService,
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.expectedSecret = this.configService.get("VENDURE_TO_DRIVER_SECRET");
  }

  private getEventIdKey(eventId: string): string {
    return `idempotency:vendure-event:${eventId}`;
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

    const eventIdKey = this.getEventIdKey(payload.eventId);
    const alreadyProcessed = await this.redisService
      .getClient()
      .exists(eventIdKey);

    if (alreadyProcessed === 1) {
      this.logger.warn(
        `Duplicate seller-order-ready event skipped: ${payload.eventId}`,
      );
      return {
        status: "ignored",
        message: "Duplicate event ignored",
      };
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

      await this.redisService
        .getClient()
        .set(eventIdKey, "1", "EX", this.eventIdTtlSeconds);

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
