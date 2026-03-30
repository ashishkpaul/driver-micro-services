// src/drivers/drivers.service.ts
import {
  Injectable,
  NotFoundException,
  Logger,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Between } from "typeorm";
import { Driver } from "./entities/driver.entity";
import { DriverStats } from "../delivery-intelligence/driver/driver-stats.entity";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { RedisService } from "../redis/redis.service";
import { DriverStatus } from "./enums/driver-status.enum";
import { DispatchScoringService } from "../dispatch-scoring/dispatch-scoring.service";
import {
  EarningsPeriod,
  DriverEarningsResponse,
  DailyEarningsHistory,
} from "./dto/driver-earnings.dto";
import {
  Delivery,
  DeliveryStatus,
} from "../deliveries/entities/delivery.entity";

@Injectable()
export class DriversService {
  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  // Distance calculation moved to geo.utils.ts
  // calculateDistance() and toRad() removed from here

  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(DriverStats)
    private readonly driverStatsRepo: Repository<DriverStats>,
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly redisService: RedisService,
    private readonly dispatchScoringService: DispatchScoringService,
  ) {}

  /* ------------------------------------------------------------------ */
  /* Admin operations                                                     */
  /* ------------------------------------------------------------------ */

  async create(dto: CreateDriverDto): Promise<Driver> {
    const driver = this.driverRepository.create(dto);
    return this.driverRepository.save(driver);
  }

  async save(driver: Driver): Promise<Driver> {
    return this.driverRepository.save(driver);
  }

  async findAll(): Promise<Driver[]> {
    return this.driverRepository.find({
      order: { createdAt: "DESC" },
    });
  }

  async findAllWithFilters(options: {
    cityId?: string;
    zoneId?: string;
    status?: DriverStatus;
    registrationStatus?: string;
    isActive?: boolean;
    authProvider?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ drivers: Driver[]; total: number }> {
    const {
      cityId,
      zoneId,
      status,
      registrationStatus,
      isActive,
      authProvider,
      search,
      skip = 0,
      take = 50,
    } = options;

    const query = this.driverRepository
      .createQueryBuilder("driver")
      .skip(skip)
      .take(take)
      .orderBy("driver.createdAt", "DESC");

    if (cityId) {
      query.andWhere("driver.cityId = :cityId", { cityId });
    }

    if (zoneId) {
      query.andWhere("driver.zoneId = :zoneId", { zoneId });
    }

    if (status) {
      query.andWhere("driver.status = :status", { status });
    }

    if (registrationStatus) {
      query.andWhere("driver.registrationStatus = :registrationStatus", {
        registrationStatus,
      });
    }

    if (isActive !== undefined) {
      query.andWhere("driver.isActive = :isActive", { isActive });
    }

    if (authProvider) {
      query.andWhere("driver.authProvider = :authProvider", { authProvider });
    }

    if (search) {
      query.andWhere(
        "(LOWER(driver.name) LIKE :search OR LOWER(driver.phone) LIKE :search OR LOWER(driver.email) LIKE :search)",
        { search: `%${search.toLowerCase()}%` },
      );
    }

    const [drivers, total] = await query.getManyAndCount();

    return { drivers, total };
  }

  async setActive(id: string, isActive: boolean): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.isActive = isActive;
    driver.lastActiveAt = new Date();

    const savedDriver = await this.driverRepository.save(driver);

    if (!isActive) {
      try {
        await this.redisService.markDriverOffline(id);
        // Force invalidation in Redis for 24 hours (or your JWT TTL)
        await this.redisService
          .getClient()
          .set(`revoked_token:${id}`, "true", "EX", 86400);
      } catch (e) {
        this.logger.error(`Redis offline failed for ${id}`, e);
      }
    }

    return savedDriver;
  }

  async setActiveWithCityIsolation(
    id: string,
    isActive: boolean,
    actor: { role: string; cityId?: string },
  ): Promise<Driver> {
    const driver = await this.findOne(id);

    // STAGE 3: City Isolation Check
    if (actor.role !== "SUPER_ADMIN" && actor.cityId !== driver.cityId) {
      this.logger.warn(
        `City mismatch: Admin ${actor.cityId} attempted to modify Driver in ${driver.cityId}`,
      );
      throw new ForbiddenException(
        "You do not have permission to manage drivers outside your city.",
      );
    }

    driver.isActive = isActive;
    driver.lastActiveAt = new Date();

    const savedDriver = await this.driverRepository.save(driver);

    if (!isActive) {
      try {
        await this.redisService.markDriverOffline(id);
        // Force invalidation in Redis for 24 hours (or your JWT TTL)
        await this.redisService
          .getClient()
          .set(`revoked_token:${id}`, "true", "EX", 86400);
      } catch (e) {
        this.logger.error(`Redis offline failed for ${id}`, e);
      }
    }

    return savedDriver;
  }

  async remove(id: string): Promise<void> {
    const res = await this.driverRepository.delete(id);
    if (!res.affected) {
      throw new NotFoundException(`Driver ${id} not found`);
    }

    try {
      await this.redisService.markDriverOffline(id);
    } catch (e) {
      this.logger.error(`Redis cleanup failed for ${id}`, e);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Read operations                                                      */
  /* ------------------------------------------------------------------ */

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({ where: { id } });
    if (!driver) throw new NotFoundException(`Driver ${id} not found`);
    return driver;
  }

  async findById(id: string): Promise<Driver | null> {
    return this.driverRepository.findOne({ where: { id } });
  }

  async findByGoogleSub(googleSub: string): Promise<Driver | null> {
    return this.driverRepository.findOne({ where: { googleSub } });
  }

  async findByEmail(email: string): Promise<Driver | null> {
    return this.driverRepository.findOne({ where: { email } });
  }

  async createGooglePendingDriver(data: {
    name: string;
    email: string;
    googleSub: string;
  }): Promise<Driver> {
    const driver = this.driverRepository.create({
      name: data.name,
      email: data.email,
      googleSub: data.googleSub,
      authProvider: "google",
      isActive: false,
    });

    return this.driverRepository.save(driver);
  }

  async findAvailable(
    lat?: number,
    lon?: number,
    radiusKm?: number,
  ): Promise<Driver[]> {
    const limit = 50;

    if (lat !== undefined && lon !== undefined) {
      try {
        const redisDrivers = await this.redisService.findAvailableDrivers(
          lat,
          lon,
          radiusKm || 5,
          limit,
        );

        if (!redisDrivers.length) return [];

        const ids = redisDrivers.map((d) => d.driverId);

        const drivers = await this.driverRepository
          .createQueryBuilder("driver")
          .where("driver.id IN (:...ids)", { ids })
          .andWhere("driver.isActive = true")
          .andWhere("driver.status = :status", {
            status: DriverStatus.AVAILABLE,
          })
          .andWhere("driver.registrationStatus = :registrationStatus", {
            registrationStatus: "APPROVED",
          })
          .getMany();

        const map = new Map(drivers.map((d) => [d.id, d]));
        return redisDrivers
          .map(({ driverId }) => map.get(driverId))
          .filter(Boolean) as Driver[];
      } catch (e) {
        this.logger.warn("Redis unavailable, fallback to DB", e);
      }
    }

    return this.driverRepository.find({
      where: {
        isActive: true,
        status: DriverStatus.AVAILABLE,
        registrationStatus: "APPROVED" as any,
      },
      order: { lastActiveAt: "DESC" },
      take: limit,
    });
  }

  async findNearestAvailable(lat: number, lon: number): Promise<Driver | null> {
    const available = await this.findAvailable(lat, lon, 5); // 5km radius
    return available.length > 0 ? available[0] : null;
  }

  async getStats(driverId: string): Promise<DriverStats | null> {
    return this.driverRepository.manager
      .createQueryBuilder(DriverStats, "stats")
      .where("stats.driverId = :driverId", { driverId })
      .getOne();
  }

  async getDriverScore(driverId: string) {
    // 1. Verify driver exists
    await this.findOne(driverId);

    // 2. Get current aggregate score
    const totalScore =
      await this.dispatchScoringService.getCurrentScore(driverId);

    // 3. Get eligibility status (context for ops)
    const isEligible =
      await this.dispatchScoringService.isDriverEligible(driverId);

    return {
      driverId,
      totalScore,
      isEligible,
      calculatedAt: new Date(),
      // Note: If your DispatchScoringService has a breakdown method, call it here.
      // Otherwise, this provides the high-level diagnostic ops needs.
    };
  }

  /* ------------------------------------------------------------------ */
  /* Driver lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  async updateLocation(id: string, lat: number, lon: number): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.currentLat = lat;
    driver.currentLon = lon;
    driver.lastActiveAt = new Date();
    driver.lastLocationUpdateAt = new Date(); // Activity tracking

    // DO NOT change driver status here
    // Location updates should not modify availability state

    const savedDriver = await this.driverRepository.save(driver);

    try {
      // Only update Redis location if driver is AVAILABLE
      if (driver.status === DriverStatus.AVAILABLE) {
        await this.redisService.updateDriverLocation(id, lat, lon, 60);
      }
    } catch (e) {
      this.logger.error(`Redis location update failed ${id}`, e);
    }

    return savedDriver;
  }

  async updateStatus(id: string, status: DriverStatus): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.status = status;
    driver.lastActiveAt = new Date();
    driver.lastStatusUpdateAt = new Date(); // Activity tracking

    const savedDriver = await this.driverRepository.save(driver);

    try {
      if (status === DriverStatus.BUSY) {
        await this.redisService.markDriverBusy(id);
      } else if (status === DriverStatus.OFFLINE) {
        await this.redisService.markDriverOffline(id);
      } else if (
        status === DriverStatus.AVAILABLE &&
        savedDriver.currentLat &&
        savedDriver.currentLon
      ) {
        await this.redisService.updateDriverLocation(
          id,
          savedDriver.currentLat,
          savedDriver.currentLon,
          60,
        );
      }
    } catch (e) {
      this.logger.error(`Redis status update failed ${id}`, e);
    }

    return savedDriver;
  }

  /**
   * Get driver earnings for a specified period
   */
  async getDriverEarnings(
    driverId: string,
    period: EarningsPeriod,
  ): Promise<DriverEarningsResponse> {
    // Verify driver exists
    await this.findOne(driverId);

    const now = new Date();
    let startDate: Date;
    let periodLabel: string;

    // Calculate date range based on period
    switch (period) {
      case EarningsPeriod.TODAY:
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        periodLabel = "Today";
        break;
      case EarningsPeriod.WEEK:
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now);
        startDate.setDate(now.getDate() - daysToMonday);
        startDate.setHours(0, 0, 0, 0);
        periodLabel = "This Week";
        break;
      case EarningsPeriod.MONTH:
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = "This Month";
        break;
    }

    // Query deliveries for this driver in the date range
    const deliveries = await this.deliveryRepository.find({
      where: {
        driverId,
        createdAt: Between(startDate, now),
      },
      order: { createdAt: "ASC" },
    });

    // Calculate statistics
    const totalDeliveries = deliveries.length;
    const completedDeliveries = deliveries.filter(
      (d) => d.status === DeliveryStatus.DELIVERED,
    ).length;
    const failedDeliveries = deliveries.filter(
      (d) =>
        d.status === DeliveryStatus.FAILED ||
        d.status === DeliveryStatus.CANCELLED,
    ).length;

    // Calculate total earnings (assuming a base rate per delivery)
    // In a real system, this would come from a pricing/earnings table
    const baseRatePerDelivery = 50; // Example: ₹50 per delivery
    const totalEarnings = completedDeliveries * baseRatePerDelivery;

    // Calculate average delivery time for completed deliveries
    const completedDeliveriesWithTime = deliveries.filter(
      (d) =>
        d.status === DeliveryStatus.DELIVERED && d.deliveredAt && d.assignedAt,
    );

    let avgDeliveryTimeMinutes = 0;
    if (completedDeliveriesWithTime.length > 0) {
      const totalTime = completedDeliveriesWithTime.reduce((sum, d) => {
        const deliveryTime =
          (d.deliveredAt!.getTime() - d.assignedAt!.getTime()) / (1000 * 60);
        return sum + deliveryTime;
      }, 0);
      avgDeliveryTimeMinutes = Math.round(
        totalTime / completedDeliveriesWithTime.length,
      );
    }

    // Build daily history
    const dailyHistory: DailyEarningsHistory[] = [];
    const historyMap = new Map<string, DailyEarningsHistory>();

    // Initialize all days in the period with zero values
    const currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dateKey = currentDate.toISOString().split("T")[0];
      historyMap.set(dateKey, {
        date: dateKey,
        totalDeliveries: 0,
        completedDeliveries: 0,
        failedDeliveries: 0,
        earnings: 0,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Populate with actual data
    for (const delivery of deliveries) {
      const dateKey = delivery.createdAt.toISOString().split("T")[0];
      const dayStats = historyMap.get(dateKey);
      if (dayStats) {
        dayStats.totalDeliveries++;
        if (delivery.status === DeliveryStatus.DELIVERED) {
          dayStats.completedDeliveries++;
          dayStats.earnings += baseRatePerDelivery;
        } else if (
          delivery.status === DeliveryStatus.FAILED ||
          delivery.status === DeliveryStatus.CANCELLED
        ) {
          dayStats.failedDeliveries++;
        }
      }
    }

    // Convert map to array and sort by date
    const sortedHistory = Array.from(historyMap.values()).sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return {
      period: periodLabel,
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      totalEarnings,
      avgDeliveryTimeMinutes,
      history: sortedHistory,
    };
  }
}
