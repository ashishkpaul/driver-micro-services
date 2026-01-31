// src/drivers/drivers.service.ts
import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver } from './entities/driver.entity';
import { CreateDriverDto } from './dto/create-driver.dto';
import { RedisService } from '../redis/redis.service';
import { DriverStatus } from './enums/driver-status.enum';

@Injectable()
export class DriversService {

  /* ------------------------------------------------------------------ */
  /* Utilities                                                           */
  /* ------------------------------------------------------------------ */

  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  private toRad(value: number): number {
    return (value * Math.PI) / 180;
  }
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly redisService: RedisService,
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
      order: { createdAt: 'DESC' },
    });
  }

  async setActive(id: string, isActive: boolean): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.isActive = isActive;
    driver.lastActiveAt = new Date();

    if (!isActive) {
      try {
        await this.redisService.markDriverOffline(id);
      } catch (e) {
        this.logger.error(`Redis offline failed for ${id}`, e);
      }
    }

    return this.driverRepository.save(driver);
  }

  async remove(id: string): Promise<void> {
    try {
      await this.redisService.markDriverOffline(id);
    } catch (e) {
      this.logger.error(`Redis cleanup failed for ${id}`, e);
    }

    const res = await this.driverRepository.delete(id);
    if (!res.affected) {
      throw new NotFoundException(`Driver ${id} not found`);
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

  async findAvailable(
    lat?: number,
    lon?: number,
    radiusKm?: number,
  ): Promise<Driver[]> {
    const limit = 50;

    if (lat !== undefined && lon !== undefined) {
      try {
        const redisDrivers =
          await this.redisService.findAvailableDrivers(
            lat,
            lon,
            radiusKm || 5,
            limit,
          );

        if (!redisDrivers.length) return [];

        const ids = redisDrivers.map((d) => d.driverId);

        const drivers = await this.driverRepository
          .createQueryBuilder('driver')
          .where('driver.id IN (:...ids)', { ids })
          .andWhere('driver.isActive = true')
          .andWhere('driver.status = :status', {
            status: DriverStatus.AVAILABLE,
          })
          .getMany();

        const map = new Map(drivers.map((d) => [d.id, d]));
        return redisDrivers
          .map(({ driverId }) => map.get(driverId))
          .filter(Boolean) as Driver[];
      } catch (e) {
        this.logger.warn('Redis unavailable, fallback to DB', e);
      }
    }

    return this.driverRepository.find({
      where: {
        isActive: true,
        status: DriverStatus.AVAILABLE,
      },
      order: { lastActiveAt: 'DESC' },
      take: limit,
    });
  }

  /* ------------------------------------------------------------------ */
  /* Driver lifecycle                                                     */
  /* ------------------------------------------------------------------ */

  async updateLocation(
    id: string,
    lat: number,
    lon: number,
  ): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.currentLat = lat;
    driver.currentLon = lon;
    driver.status = DriverStatus.AVAILABLE;
    driver.lastActiveAt = new Date();

    try {
      await this.redisService.updateDriverLocation(id, lat, lon, 60);
    } catch (e) {
      this.logger.error(`Redis location update failed ${id}`, e);
    }

    return this.driverRepository.save(driver);
  }

  async updateStatus(
    id: string,
    status: DriverStatus,
  ): Promise<Driver> {
    const driver = await this.findOne(id);

    driver.status = status;
    driver.lastActiveAt = new Date();

    try {
      if (status === DriverStatus.BUSY) {
        await this.redisService.markDriverBusy(id);
      } else if (status === DriverStatus.OFFLINE) {
        await this.redisService.markDriverOffline(id);
      } else if (
        status === DriverStatus.AVAILABLE &&
        driver.currentLat &&
        driver.currentLon
      ) {
        await this.redisService.updateDriverLocation(
          id,
          driver.currentLat,
          driver.currentLon,
          60,
        );
      }
    } catch (e) {
      this.logger.error(`Redis status update failed ${id}`, e);
    }

    return this.driverRepository.save(driver);
  }
}
