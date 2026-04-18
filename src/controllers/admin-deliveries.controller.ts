// src/controllers/admin-deliveries.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Headers,
  ParseUUIDPipe,
  Param,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { AdminRole } from "../entities/admin-user.entity";
import { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { Delivery } from "../deliveries/entities/delivery.entity";

@Controller({ path: "admin/deliveries", version: VERSION_NEUTRAL })
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class AdminDeliveriesController {
  private readonly vendureSecret: string;

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly configService: ConfigService,
  ) {
    this.vendureSecret = this.configService.get('VENDURE_TO_DRIVER_SECRET') ?? '';
  }

  /**
   * GET /admin/deliveries/stats
   *
   * Get delivery statistics for admin dashboard
   */
  @Get("stats")
  @RequirePermissions(Permission.ADMIN_READ_DELIVERY_ANY)
  async getDeliveryStats(
    @Req() request: Request & { user: any },
    @Headers('x-webhook-secret') webhookSecret?: string,
    @Query("cityId") cityId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
  ) {
    // Allow Vendure internal service-to-service calls via shared secret (bypasses JWT)
    const isInternalCall = webhookSecret && webhookSecret === this.vendureSecret;

    let filterCityId = cityId;
    if (!isInternalCall && request.user?.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user?.cityId;
    }

    const qb = this.deliveryRepository.createQueryBuilder("d");
    if (filterCityId) qb.andWhere("d.cityId = :cityId", { cityId: filterCityId });
    if (dateFrom) qb.andWhere("d.createdAt >= :dateFrom", { dateFrom: new Date(dateFrom) });
    if (dateTo) qb.andWhere("d.createdAt <= :dateTo", { dateTo: new Date(dateTo) });

    const [
      byStatus,
      onTime,
      slaBreached,
      avgTimes,
    ] = await Promise.all([
      // Count by status
      qb.clone()
        .select("d.status", "status")
        .addSelect("COUNT(*)", "count")
        .groupBy("d.status")
        .getRawMany<{ status: string; count: string }>(),

      // On-time: delivered before or at expectedDeliveryAt (or no SLA set)
      qb.clone()
        .andWhere("d.status = 'DELIVERED'")
        .andWhere("(d.slaBreachAt IS NULL)")
        .getCount(),

      // SLA breached: slaBreachAt was set (includes in-flight breaches + delivered-late)
      qb.clone()
        .andWhere("d.slaBreachAt IS NOT NULL")
        .getCount(),

      // Average phase durations (seconds) for delivered orders
      qb.clone()
        .select("AVG(EXTRACT(EPOCH FROM (d.assignedAt - d.createdAt)))", "avgDispatchToAssignSec")
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.pickedUpAt - d.assignedAt)))", "avgAssignToPickupSec")
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.deliveredAt - d.pickedUpAt)))", "avgPickupToDeliverSec")
        .addSelect("AVG(EXTRACT(EPOCH FROM (d.deliveredAt - d.createdAt)))", "avgTotalSec")
        .andWhere("d.status = 'DELIVERED'")
        .getRawOne<Record<string, string>>(),
    ]);

    const statusMap = byStatus.reduce((acc, r) => {
      acc[r.status] = parseInt(r.count, 10);
      return acc;
    }, {} as Record<string, number>);

    const pending = (statusMap['PENDING'] ?? 0) + (statusMap['ASSIGNED'] ?? 0) + (statusMap['PICKED_UP'] ?? 0) + (statusMap['IN_TRANSIT'] ?? 0);

    return {
      byStatus: statusMap,
      pending,
      onTime,
      slaBreached,
      slaBreachRate: onTime + slaBreached > 0
        ? Math.round((slaBreached / (onTime + slaBreached)) * 100 * 10) / 10
        : 0,
      avgDurations: {
        dispatchToAssignSeconds: parseFloat(avgTimes?.avgDispatchToAssignSec ?? '0') || 0,
        assignToPickupSeconds: parseFloat(avgTimes?.avgAssignToPickupSec ?? '0') || 0,
        pickupToDeliverSeconds: parseFloat(avgTimes?.avgPickupToDeliverSec ?? '0') || 0,
        totalSeconds: parseFloat(avgTimes?.avgTotalSec ?? '0') || 0,
      },
    };
  }

  /**
   * GET /admin/deliveries
   *
   * List deliveries with filters for admin
   */
  @Get()
  @RequirePermissions(Permission.ADMIN_READ_DELIVERY_ANY)
  async listDeliveries(
    @Req() request: Request & { user: any },
    @Query("status") status?: string,
    @Query("driverId") driverId?: string,
    @Query("cityId") cityId?: string,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    // Build query
    const queryBuilder = this.deliveryRepository
      .createQueryBuilder("delivery")
      .orderBy("delivery.createdAt", "DESC");

    // Apply filters
    if (status) {
      queryBuilder.andWhere("delivery.status = :status", { status });
    }

    if (driverId) {
      queryBuilder.andWhere("delivery.driverId = :driverId", { driverId });
    }

    if (filterCityId) {
      queryBuilder.andWhere("delivery.cityId = :cityId", {
        cityId: filterCityId,
      });
    }

    if (dateFrom) {
      queryBuilder.andWhere("delivery.createdAt >= :dateFrom", {
        dateFrom: new Date(dateFrom),
      });
    }

    if (dateTo) {
      queryBuilder.andWhere("delivery.createdAt <= :dateTo", {
        dateTo: new Date(dateTo),
      });
    }

    // Pagination
    const skipNum = parseInt(skip || "0") || 0;
    const takeNum = parseInt(take || "20") || 20;

    queryBuilder.skip(skipNum).take(takeNum);

    const [deliveries, total] = await queryBuilder.getManyAndCount();

    return {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        sellerOrderId: d.sellerOrderId,
        status: d.status,
        driverId: d.driverId,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      total,
      skip: skipNum,
      take: takeNum,
    };
  }

  /**
   * GET /admin/drivers/:id/deliveries
   *
   * Get delivery history for a specific driver
   */
  @Get("drivers/:id/deliveries")
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async getDriverDeliveries(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Req() request: Request & { user: any },
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    // SUPER_ADMIN can see all, ADMIN can only see their city's drivers
    const where: any = { driverId };

    if (request.user.role !== AdminRole.SUPER_ADMIN) {
      where.cityId = request.user.cityId;
    }

    const skipNum = parseInt(skip || "0") || 0;
    const takeNum = parseInt(take || "20") || 20;

    const [deliveries, total] = await this.deliveryRepository.findAndCount({
      where,
      order: { createdAt: "DESC" },
      skip: skipNum,
      take: takeNum,
    });

    return {
      deliveries: deliveries.map((d) => ({
        id: d.id,
        sellerOrderId: d.sellerOrderId,
        status: d.status,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      })),
      total,
      skip: skipNum,
      take: takeNum,
    };
  }
}
