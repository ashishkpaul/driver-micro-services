import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { DeliveryAssignedDto, DeliveryPickedUpDto, DeliveryDeliveredDto, DeliveryFailedDto } from './dto/vendure-webhook.dto';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly vendureWebhookUrl: string | undefined;
  private readonly webhookSecret: string | undefined;

  constructor(private configService: ConfigService) {
    this.vendureWebhookUrl = this.configService.get('VENDURE_WEBHOOK_URL');
    this.webhookSecret = this.configService.get('WEBHOOK_SECRET');
  }

  private async sendToVendure(payload: any, eventType: string): Promise<void> {
    if (!this.vendureWebhookUrl) {
      this.logger.warn('VENDURE_WEBHOOK_URL not configured, skipping webhook');
      return;
    }

    const webhookPayload = {
      event: eventType,
      version: 1,
      timestamp: new Date().toISOString(),
      ...payload,
    };

    try {
      await axios.post(this.vendureWebhookUrl, webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': this.webhookSecret,
        },
        timeout: 5000, // 5 second timeout
      });
      
      this.logger.log(`Successfully sent ${eventType} webhook for seller order ${payload.sellerOrderId}`);
    } catch (error) {
      this.logger.error(`Failed to send ${eventType} webhook:`, error.message);
      // In production, implement retry logic with exponential backoff
    }
  }

  async emitDeliveryAssigned(data: DeliveryAssignedDto): Promise<void> {
    await this.sendToVendure(data, 'DELIVERY_ASSIGNED_V1');
  }

  async emitDeliveryPickedUp(data: DeliveryPickedUpDto): Promise<void> {
    await this.sendToVendure(data, 'DELIVERY_PICKED_UP_V1');
  }

  async emitDeliveryDelivered(data: DeliveryDeliveredDto): Promise<void> {
    await this.sendToVendure(data, 'DELIVERY_DELIVERED_V1');
  }

  async emitDeliveryFailed(data: DeliveryFailedDto): Promise<void> {
    await this.sendToVendure(data, 'DELIVERY_FAILED_V1');
  }

  // For receiving webhooks from driver mobile app
  async handleDriverEvent(event: any): Promise<void> {
    // This would handle events from driver mobile app
    // Example: location updates, status changes, etc.
    this.logger.log(`Received driver event: ${JSON.stringify(event)}`);
  }
}
