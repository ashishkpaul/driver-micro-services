import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Driver } from "./entities/driver.entity";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
    private redisService: RedisService,
  ) {}

  async create(createDriverDto: CreateDriverDto): Promise<Driver> {
    const driver = this.driverRepository.create(createDriverDto);
    const savedDriver = await this.driverRepository.save(driver);
    this.logger.log(`Driver created: ${savedDriver.id}`);
    return savedDriver;
  }

  async findAll(): Promise<Driver[]> {
    return await this.driverRepository.find({
      order: { createdAt: "DESC" },
    });
  }

  async findAvailable(lat?: number, lon?: number, radiusKm?: number): Promise<Driver[]> {
    const limit = 50;
    
    // If location is provided, try Redis geo search first
    if (lat !== undefined && lon !== undefined) {
      try {
        const availableDrivers = await this.redisService.findAvailableDrivers(
          lat,
          lon,
          radiusKm || 5,
          limit,
        );

        if (availableDrivers.length === 0) {
          return [];
        }

        // Get driver IDs from Redis results
        const driverIds = availableDrivers.map((driver) => driver.driverId);

        // Fetch drivers from PostgreSQL
        const drivers = await this.driverRepository
          .createQueryBuilder("driver")
          .where("driver.id IN (:...driverIds)", { driverIds })
          .andWhere("driver.isActive = :isActive", { isActive: true })
          .andWhere("driver.status = :status", { status: "AVAILABLE" })
          .getMany();

        // Return drivers in the same order as Redis results (nearest first)
        const driverMap = new Map(drivers.map((driver) => [driver.id, driver]));
        const orderedDrivers: Driver[] = [];
        for (const { driverId } of availableDrivers) {
          const driver = driverMap.get(driverId);
          if (driver) {
            orderedDrivers.push(driver);
          }
        }

        return orderedDrivers;
      } catch (error) {
        this.logger.warn("Redis unavailable for geo search, falling back to DB with location filtering", error);
        // Fallback to PostgreSQL query with location filtering and in-memory distance calculation
        const drivers = await this.driverRepository
          .createQueryBuilder("driver")
          .where("driver.isActive = :isActive", { isActive: true })
          .andWhere("driver.status = :status", { status: "AVAILABLE" })
          .andWhere("driver.currentLat IS NOT NULL")
          .andWhere("driver.currentLon IS NOT NULL")
          .getMany();

        // Calculate distance for each driver
        const driversWithDistance = drivers
          .map(driver => ({
            driver,
            distance: this.calculateDistance(lat, lon, driver.currentLat!, driver.currentLon!),
          }))
          .filter(driverWithDistance => radiusKm ? driverWithDistance.distance <= radiusKm : true)
          .sort((a, b) => a.distance - b.distance)
          .slice(0, limit)
          .map(driverWithDistance => driverWithDistance.driver);

        return driversWithDistance;
      }
    }

    // Fallback to PostgreSQL query (no location provided)
    return await this.driverRepository.find({
      where: {
        isActive: true,
        status: "AVAILABLE",
      },
      order: { lastActiveAt: "DESC" },
      take: limit,
    });
  }

  async findOne(id: string): Promise<Driver> {
    const driver = await this.driverRepository.findOne({ where: { id } });
    if (!driver) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }
    return driver;
  }

  async updateLocation(id: string, lat: number, lon: number): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.currentLat = lat;
    driver.currentLon = lon;
    driver.status = "AVAILABLE";
    driver.lastActiveAt = new Date();
    driver.isActive = true;

    // Update Redis first (latency-critical)
    try {
      await this.redisService.updateDriverLocation(id, lat, lon, 60);
    } catch (error) {
      this.logger.error(`Failed to update driver location in Redis: ${id}`, error);
      // Don't throw, as PostgreSQL is source of truth
    }

    // Then update PostgreSQL
    const updatedDriver = await this.driverRepository.save(driver);
    return updatedDriver;
  }

  async updateStatus(
    id: string,
    status: "AVAILABLE" | "BUSY" | "OFFLINE",
  ): Promise<Driver> {
    const driver = await this.findOne(id);
    const previousStatus = driver.status;
    driver.status = status;
    driver.lastActiveAt = new Date();

    if (status === "OFFLINE") {
      driver.isActive = false;
    } else {
      driver.isActive = true;
    }

    // Update Redis first (latency-critical)
    try {
      if (status === "BUSY") {
        await this.redisService.markDriverBusy(id);
      } else if (status === "OFFLINE") {
        await this.redisService.markDriverOffline(id);
      } else if (status === "AVAILABLE") {
        // If driver is becoming available, we need to have location to add to geo index
        if (driver.currentLat && driver.currentLon) {
          await this.redisService.updateDriverLocation(
            id,
            driver.currentLat,
            driver.currentLon,
            60,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Failed to update driver status in Redis: ${id}`, error);
      // Don't throw, as PostgreSQL is source of truth
    }

    // Then update PostgreSQL
    const updatedDriver = await this.driverRepository.save(driver);
    return updatedDriver;
  }

  async remove(id: string): Promise<void> {
    // Remove from Redis first
    try {
      await this.redisService.markDriverOffline(id);
    } catch (error) {
      this.logger.error(`Failed to remove driver from Redis: ${id}`, error);
    }

    // Then remove from PostgreSQL
    const result = await this.driverRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Driver with ID ${id} not found`);
    }
  }

  // Haversine distance calculation (km)
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }
}
