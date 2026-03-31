import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { WebhooksService } from "./webhooks.service";
import { ConfigService } from "@nestjs/config";

@Controller({ path: "webhooks", version: VERSION_NEUTRAL })
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {}

  @Post("driver-events")
  @HttpCode(HttpStatus.ACCEPTED)
  async handleDriverEvent(
    @Body() event: unknown,
    @Headers("X-Webhook-Secret") secret: string,
  ) {
    const expectedSecret = this.configService.get("DRIVER_APP_SECRET");

    if (secret !== expectedSecret) {
      throw new BadRequestException("Invalid webhook secret");
    }

    await this.webhooksService.handleDriverEvent(event);
    return { status: "accepted" };
  }
}
