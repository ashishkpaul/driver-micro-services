import { Controller, Post, Body, Headers, HttpCode, HttpStatus, BadRequestException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { ConfigService } from '@nestjs/config';

@Controller('webhooks')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private configService: ConfigService,
  ) {}

  @Post('driver-events')
  @HttpCode(HttpStatus.ACCEPTED)
  async handleDriverEvent(
    @Body() event: any,
    @Headers('X-Webhook-Secret') secret: string,
  ) {
    const expectedSecret = this.configService.get('DRIVER_WEBHOOK_SECRET');
    
    if (secret !== expectedSecret) {
      throw new BadRequestException('Invalid webhook secret');
    }

    await this.webhooksService.handleDriverEvent(event);
    return { status: 'accepted' };
  }
}
