import { Controller, Get, Param, Query } from '@nestjs/common';
import { DeliveryMetricsService } from './delivery-metrics.service';

@Controller('delivery-metrics')
export class DeliveryMetricsController {
  constructor(private readonly deliveryMetricsService: DeliveryMetricsService) {}

  @Get('summary')
  async getSummary(
    @Query('driverId') driverId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const filters = {
      driverId,
      zoneId,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return this.deliveryMetricsService.getSummary(filters);
  }

  @Get(':deliveryId')
  async getByDeliveryId(@Param('deliveryId') deliveryId: string) {
    return this.deliveryMetricsService.getByDeliveryId(deliveryId);
  }

  @Get('driver/:driverId')
  async getByDriverId(@Param('driverId') driverId: string) {
    return this.deliveryMetricsService.getByDriverId(driverId);
  }
}