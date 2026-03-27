import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import axiosRetry from "axios-retry";
import crypto from "node:crypto";
import { WS_EVENTS } from "../../../packages/ws-contracts";
import {
  DeliveryAssignedDto,
  DeliveryPickedUpDto,
  DeliveryDeliveredDto,
  DeliveryFailedDto,
} from "./dto/vendure-webhook.dto";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly vendureWebhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;
  private readonly axiosInstance = axios.create();

  constructor(private configService: ConfigService) {
    this.vendureWebhookUrl = this.configService.get("VENDURE_WEBHOOK_URL");
    this.webhookSecret = this.configService.get("DRIVER_TO_VENDURE_SECRET");

    axiosRetry(this.axiosInstance, {
      retries: 3,
      retryDelay: axiosRetry.exponentialDelay,
      retryCondition: axiosRetry.isNetworkOrIdempotentRequestError,
      onRetry: (retry, error) => {
        this.logger.warn(`Retry ${retry} reason: ${error.message}`);
      },
    });
  }

  private async sendToVendure(
    payload: (
      | DeliveryAssignedDto
      | DeliveryPickedUpDto
      | DeliveryDeliveredDto
      | DeliveryFailedDto
      | {
          sellerOrderId: string;
          channelId: string;
          reason?: string;
          cancelledAt?: string;
        }
    ) & { eventId?: string },
    eventType: string,
  ): Promise<void> {
    if (!this.vendureWebhookUrl) {
      this.logger.warn("VENDURE_WEBHOOK_URL not configured, skipping webhook");
      return;
    }

    const webhookPayload = {
      event: eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    try {
      await this.axiosInstance.post(this.vendureWebhookUrl, webhookPayload, {
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": this.webhookSecret,
        },
        timeout: 5000, // 5 second timeout
      });

      this.logger.log(
        `Successfully sent ${eventType} webhook for seller order ${payload.sellerOrderId}`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send ${eventType} webhook:`, errorMessage);
      // In production, implement retry logic with exponential backoff
    }
  }

  async emitDeliveryAssigned(data: DeliveryAssignedDto): Promise<void> {
    const eventId = crypto.randomUUID();
    await this.sendToVendure({ eventId, ...data }, WS_EVENTS.DELIVERY_ASSIGNED);
  }

  async emitDeliveryPickedUp(data: DeliveryPickedUpDto): Promise<void> {
    const eventId = crypto.randomUUID();
    await this.sendToVendure(
      { eventId, ...data },
      WS_EVENTS.DELIVERY_PICKUP_CONFIRMED,
    );
  }

  async emitDeliveryDelivered(data: DeliveryDeliveredDto): Promise<void> {
    const eventId = crypto.randomUUID();
    await this.sendToVendure(
      { eventId, ...data },
      WS_EVENTS.DELIVERY_DROPOFF_CONFIRMED,
    );
  }

  async emitDeliveryFailed(data: DeliveryFailedDto): Promise<void> {
    const eventId = crypto.randomUUID();
    await this.sendToVendure({ eventId, ...data }, WS_EVENTS.DELIVERY_FAILED);
  }

  async emitDeliveryCancelled(data: {
    sellerOrderId: string;
    channelId: string;
    reason?: string;
  }): Promise<void> {
    // v1 stub: mobile integration pending - driver app will call cancel endpoint
    await this.sendToVendure(
      {
        eventId: crypto.randomUUID(),
        cancelledAt: new Date().toISOString(),
        ...data,
      },
      WS_EVENTS.DELIVERY_CANCELLED,
    );
  }

  // For receiving webhooks from driver mobile app
  async handleDriverEvent(event: unknown): Promise<void> {
    // This would handle events from driver mobile app
    // Example: location updates, status changes, etc.
    this.logger.log(`Received driver event: ${JSON.stringify(event)}`);
  }
}
