import { Controller, Get, Query, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { VendureSecretGuard } from '../auth/vendure-secret.guard';

/**
 * Internal stats endpoint for Vendure → driver-backend service-to-service calls.
 * Protected by shared secret only (no JWT) so Vendure admin API can proxy it.
 */
@Controller({ path: 'internal/delivery-stats', version: VERSION_NEUTRAL })
@UseGuards(VendureSecretGuard)
export class InternalDeliveryStatsController {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
  ) {}

  @Get()
  async getStats(
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('channelId') channelId?: string,
  ) {
    const qb = this.deliveryRepo.createQueryBuilder('d');
    if (dateFrom)  qb.andWhere('d.createdAt >= :dateFrom', { dateFrom: new Date(dateFrom) });
    if (dateTo)    qb.andWhere('d.createdAt <= :dateTo',   { dateTo: new Date(dateTo) });
    if (channelId) qb.andWhere('d.channelId = :channelId', { channelId });

    const [byStatus, onTime, slaBreached, avgTimes, fulfillments] = await Promise.all([
      qb.clone()
        .select('d.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('d.status')
        .getRawMany<{ status: string; count: string }>(),

      qb.clone()
        .andWhere("d.status = 'DELIVERED'")
        .andWhere('d.slaBreachAt IS NULL')
        .getCount(),

      qb.clone()
        .andWhere('d.slaBreachAt IS NOT NULL')
        .getCount(),

      qb.clone()
        .select("AVG(EXTRACT(EPOCH FROM (d.assignedAt - d.createdAt)))",     'dispatchToAssign')
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.pickedUpAt - d.assignedAt)))", 'assignToPickup')
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.deliveredAt - d.pickedUpAt)))",'pickupToDeliver')
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.deliveredAt - d.createdAt)))", 'total')
        .andWhere("d.status = 'DELIVERED'")
        .getRawOne<Record<string, string>>(),

      // Fulfillment list: all active + recent completed (last 100)
      qb.clone()
        .select(['d.id', 'd.sellerOrderId', 'd.status', 'd.driverId',
                 'd.pickupLat', 'd.pickupLon', 'd.dropLat', 'd.dropLon',
                 'd.assignedAt', 'd.pickedUpAt', 'd.deliveredAt',
                 'd.expectedDeliveryAt', 'd.slaBreachAt', 'd.createdAt'])
        .orderBy('d.createdAt', 'DESC')
        .take(100)
        .getMany(),
    ]);

    const statusMap = byStatus.reduce((acc, r) => {
      acc[r.status] = parseInt(r.count, 10);
      return acc;
    }, {} as Record<string, number>);

    const pending = (['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] as const)
      .reduce((sum, s) => sum + (statusMap[s] ?? 0), 0);

    return {
      byStatus: statusMap,
      pending,
      onTime,
      slaBreached,
      slaBreachRate: onTime + slaBreached > 0
        ? Math.round((slaBreached / (onTime + slaBreached)) * 1000) / 10
        : 0,
      avgDurations: {
        dispatchToAssignSeconds:  parseFloat(avgTimes?.dispatchToAssign ?? '0') || 0,
        assignToPickupSeconds:    parseFloat(avgTimes?.assignToPickup   ?? '0') || 0,
        pickupToDeliverSeconds:   parseFloat(avgTimes?.pickupToDeliver  ?? '0') || 0,
        totalSeconds:             parseFloat(avgTimes?.total            ?? '0') || 0,
      },
      fulfillments: fulfillments.map(d => ({
        id:                 d.id,
        sellerOrderId:      d.sellerOrderId,
        status:             d.status,
        driverId:           d.driverId ?? null,
        pickup:             { lat: Number(d.pickupLat), lon: Number(d.pickupLon) },
        drop:               { lat: Number(d.dropLat),  lon: Number(d.dropLon)  },
        assignedAt:         d.assignedAt   ?? null,
        pickedUpAt:         d.pickedUpAt   ?? null,
        deliveredAt:        d.deliveredAt  ?? null,
        expectedDeliveryAt: d.expectedDeliveryAt ?? null,
        slaBreached:        d.slaBreachAt != null,
        createdAt:          d.createdAt,
      })),
    };
  }
}
