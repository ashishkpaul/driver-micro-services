// src/controllers/admin-deliveries.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  Param,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { AdminRole } from "../entities/admin-user.entity";
import { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { Delivery } from "../deliveries/entities/delivery.entity";

@Controller("admin/deliveries")
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class AdminDeliveriesController {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
  ) {}

  /**
   * GET /admin/deliveries/stats
   *
   * Get delivery statistics for admin dashboard
   */
  @Get("stats")
  @RequirePermissions(Permission.ADMIN_READ_DELIVERY_ANY)
  async getDeliveryStats(
    @Req() request: Request & { user: any },
    @Query("cityId") cityId?: string,
  ) {
    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    // Build query conditions
    const where: any = {};
    if (filterCityId) {
      where.cityId = filterCityId;
    }

    // Get total deliveries
    const total = await this.deliveryRepository.count({ where });

    // Get deliveries by status
    const byStatus = await this.deliveryRepository
      .createQueryBuilder("delivery")
      .select("delivery.status", "status")
      .addSelect("COUNT(*)", "count")
      .where(filterCityId ? "delivery.cityId = :cityId" : "1=1", {
        cityId: filterCityId,
      })
      .groupBy("delivery.status")
      .getRawMany();

    // Get active deliveries (not completed/failed/cancelled)
    const activeDeliveries = await this.deliveryRepository.count({
      where: {
        ...where,
        status: "ACTIVE" as any,
      },
    });

    // Get today's date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get completed today
    const completedToday = await this.deliveryRepository.count({
      where: {
        ...where,
        status: "DELIVERED" as any,
        updatedAt: Between(today, tomorrow),
      },
    });

    // Get failed today
    const failedToday = await this.deliveryRepository.count({
      where: {
        ...where,
        status: "FAILED" as any,
        updatedAt: Between(today, tomorrow),
      },
    });

    // Calculate average delivery time (simplified - using createdAt to updatedAt)
    const avgDeliveryTime = await this.deliveryRepository
      .createQueryBuilder("delivery")
      .select(
        "AVG(EXTRACT(EPOCH FROM (delivery.updatedAt - delivery.createdAt)) / 60)",
        "avgMinutes",
      )
      .where("delivery.status = :status", { status: "DELIVERED" })
      .andWhere(filterCityId ? "delivery.cityId = :cityId" : "1=1", {
        cityId: filterCityId,
      })
      .getRawOne();

    // Calculate SLA breach count (deliveries taking more than 60 minutes)
    const slaBreachCount = await this.deliveryRepository
      .createQueryBuilder("delivery")
      .where("delivery.status = :status", { status: "DELIVERED" })
      .andWhere(
        "EXTRACT(EPOCH FROM (delivery.updatedAt - delivery.createdAt)) > 3600",
      )
      .andWhere(filterCityId ? "delivery.cityId = :cityId" : "1=1", {
        cityId: filterCityId,
      })
      .getCount();

    return {
      total,
      byStatus: byStatus.reduce(
        (acc, item) => {
          acc[item.status] = parseInt(item.count);
          return acc;
        },
        {} as Record<string, number>,
      ),
      activeDeliveries,
      completedToday,
      failedToday,
      avgDeliveryTimeMinutes: parseFloat(avgDeliveryTime?.avgMinutes || "0"),
      slaBreachCount,
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
