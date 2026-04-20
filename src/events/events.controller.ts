import {
  Controller,
  Post,
  Body,
  Headers,
  BadRequestException,
  Logger,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { DeliveriesService } from "../deliveries/deliveries.service"; // ADDED
import { DriversService } from "../drivers/drivers.service"; // ADDED
import { OffersService } from "../offers/offers.service"; // ADDED
import { SafeDispatchService } from "../safe-dispatch/safe-dispatch.service"; // ADDED
import { ConfigService } from "@nestjs/config";
import {
  IsNumber,
  ValidateNested,
  IsString,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";
import { RedisService } from "../redis/redis.service";
import * as crypto from "crypto";

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

@Controller({ path: "events", version: VERSION_NEUTRAL })
export class EventsController {
  private readonly logger = new Logger(EventsController.name);
  private readonly expectedSecret: string | undefined;
  private readonly webhookSignatureSecret: string | undefined;
  private readonly enforceWebhookSignature: boolean;
  private readonly webhookMaxClockSkewMs = 5 * 60 * 1000;
  private readonly eventIdTtlSeconds = 60 * 60 * 24;

  constructor(
    private deliveriesService: DeliveriesService, // REPLACED AssignmentService
    private driversService: DriversService, // ADDED
    private offersService: OffersService, // ADDED
    private safeDispatchService: SafeDispatchService, // ADDED
    private configService: ConfigService,
    private redisService: RedisService,
  ) {
    this.expectedSecret = this.configService.get("VENDURE_TO_DRIVER_SECRET");
    this.webhookSignatureSecret =
      this.configService.get("VENDURE_WEBHOOK_SIGNATURE_SECRET") ||
      this.expectedSecret;
    this.enforceWebhookSignature =
      this.configService.get("ENFORCE_WEBHOOK_SIGNATURE") === "true";
  }

  private getEventIdKey(eventId: string): string {
    return `idempotency:vendure-event:${eventId}`;
  }

  @Post("seller-order-ready")
  async onSellerOrderReady(
    @Body() payload: SellerOrderReadyPayloadDto,
    @Headers("X-Webhook-Secret") secret: string,
    @Headers("X-Webhook-Timestamp") timestampHeader?: string,
    @Headers("X-Webhook-Signature") signatureHeader?: string,
  ) {
    // Validate webhook secret
    if (secret !== this.expectedSecret) {
      this.logger.warn(`Invalid webhook secret received: ${secret}`);
      throw new BadRequestException("Invalid webhook secret");
    }

    this.validateSignature(payload, timestampHeader, signatureHeader);

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
      // 1. Create the delivery record (V2: PENDING status)
      const delivery = await this.deliveriesService.create({
        sellerOrderId: payload.sellerOrderId,
        channelId: payload.channelId,
        pickupLat: payload.pickup.lat,
        pickupLon: payload.pickup.lon,
        dropLat: payload.drop.lat,
        dropLon: payload.drop.lon,
      });

      // 2. Use SafeDispatchService for intelligent dispatch
      const dispatchResult = await this.safeDispatchService.executeSafeDispatch(
        delivery.id,
        await this.safeDispatchService.getEligibleDrivers(
          delivery.id,
          payload.pickup.lat,
          payload.pickup.lon,
          10, // maxDistanceKm
          20, // limit
        ),
        // Fallback callback for legacy dispatch
        async (deliveryId: string, reason: string) => {
          this.logger.warn(`Using legacy dispatch for delivery ${deliveryId}: ${reason}`);
          
          // Legacy dispatch logic
          const nearestDriver = await this.driversService.findNearestAvailable(
            payload.pickup.lat,
            payload.pickup.lon,
          );

          if (!nearestDriver) {
            this.logger.warn(
              `No available drivers for order ${payload.sellerOrderId}`,
            );
            return {
              status: "queued",
              deliveryId: delivery.id,
              message: "No drivers available",
            };
          }

          // Create offer — This triggers OFFER_CREATED_V2 via WebSocket
          await this.offersService.createOfferForDriver({
            driverId: nearestDriver.id,
            deliveryId: delivery.id,
            expiresInSeconds: 30,
          });

          return {
            status: "success",
            deliveryId: delivery.id,
            message: "Legacy dispatch: Offer broadcasted to nearest driver",
          };
        },
      );

      await this.redisService
        .getClient()
        .set(eventIdKey, "1", "EX", this.eventIdTtlSeconds);

      this.logger.log(
        `Dispatch completed for order ${payload.sellerOrderId}, delivery ID: ${delivery.id}, method: ${dispatchResult.method || 'legacy'}`,
      );

      return {
        status: "success",
        deliveryId: delivery.id,
        message: dispatchResult.message || "Dispatch completed",
        method: dispatchResult.method || "legacy",
      };
    } catch (error: any) {
      // PostgreSQL unique violation code: 23505
      const isUniqueViolation =
        error?.code === "23505" ||
        error?.message?.includes("unique constraint");

      if (isUniqueViolation) {
        this.logger.warn(
          `Idempotency: Delivery already exists for sellerOrderId=${payload.sellerOrderId}. Returning 200.`,
        );

        // Heal the Redis state: set the key so subsequent checks don't even hit the DB
        await this.redisService
          .getClient()
          .set(eventIdKey, "1", "EX", this.eventIdTtlSeconds);

        return {
          status: "ignored",
          message: "Duplicate delivery suppressed by DB constraint",
        };
      }

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

  private validateSignature(
    payload: SellerOrderReadyPayloadDto,
    timestampHeader?: string,
    signatureHeader?: string,
  ): void {
    if (!timestampHeader || !signatureHeader || !this.webhookSignatureSecret) {
      if (this.enforceWebhookSignature) {
        throw new BadRequestException("Missing webhook signature headers");
      }
      return;
    }

    const requestTimestamp = Number(timestampHeader);
    if (!Number.isFinite(requestTimestamp)) {
      throw new BadRequestException("Invalid webhook timestamp");
    }

    const skew = Math.abs(Date.now() - requestTimestamp);
    if (skew > this.webhookMaxClockSkewMs) {
      throw new BadRequestException("Webhook timestamp outside accepted skew");
    }

    const signingPayload = [
      payload.eventId,
      payload.sellerOrderId,
      payload.channelId,
      timestampHeader,
    ].join(":");

    const expectedSignature = crypto
      .createHmac("sha256", this.webhookSignatureSecret)
      .update(signingPayload)
      .digest("hex");

    if (expectedSignature !== signatureHeader) {
      throw new BadRequestException("Invalid webhook signature");
    }
  }

  // ✅ V2 WORKFLOW: Driver acceptance workflow is now active
  // Offers are created and drivers can accept/reject via PWA
  // Assignment only happens after driver acceptance
}
