// src/drivers/drivers.service.ts
import { Injectable, NotFoundException, Logger, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Driver } from "./entities/driver.entity";
import { DriverStats } from "../delivery-intelligence/driver/driver-stats.entity";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { RedisService } from "../redis/redis.service";
import { DriverStatus } from "./enums/driver-status.enum";
import { DispatchScoringService } from "../dispatch-scoring/dispatch-scoring.service";

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

  async findAll(): Promise<Driver[]> {
    return this.driverRepository.find({
      order: { createdAt: "DESC" },
    });
  }

  async findAllWithFilters(options: {
    cityId?: string;
    zoneId?: string;
    status?: DriverStatus;
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
        await this.redisService.getClient().set(`revoked_token:${id}`, 'true', 'EX', 86400);
      } catch (e) {
        this.logger.error(`Redis offline failed for ${id}`, e);
      }
    }

    return savedDriver;
  }

  async setActiveWithCityIsolation(
    id: string, 
    isActive: boolean, 
    actor: { role: string; cityId?: string }
  ): Promise<Driver> {
    const driver = await this.findOne(id);

    // STAGE 3: City Isolation Check
    if (actor.role !== 'SUPER_ADMIN' && actor.cityId !== driver.cityId) {
      this.logger.warn(`City mismatch: Admin ${actor.cityId} attempted to modify Driver in ${driver.cityId}`);
      throw new ForbiddenException('You do not have permission to manage drivers outside your city.');
    }

    driver.isActive = isActive;
    driver.lastActiveAt = new Date();

    const savedDriver = await this.driverRepository.save(driver);

    if (!isActive) {
      try {
        await this.redisService.markDriverOffline(id);
        // Force invalidation in Redis for 24 hours (or your JWT TTL)
        await this.redisService.getClient().set(`revoked_token:${id}`, 'true', 'EX', 86400);
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
    const totalScore = await this.dispatchScoringService.getCurrentScore(driverId);
    
    // 3. Get eligibility status (context for ops)
    const isEligible = await this.dispatchScoringService.isDriverEligible(driverId);

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
}
