import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Driver } from "./entities/driver.entity";
import { CreateDriverDto } from "./dto/create-driver.dto";

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private driverRepository: Repository<Driver>,
  ) {}

  async create(createDriverDto: CreateDriverDto): Promise<Driver> {
    const driver = this.driverRepository.create(createDriverDto);
    return await this.driverRepository.save(driver);
  }

  async findAll(): Promise<Driver[]> {
    return await this.driverRepository.find({
      order: { createdAt: "DESC" },
    });
  }

  async findAvailable(): Promise<Driver[]> {
    return await this.driverRepository.find({
      where: {
        isActive: true,
        status: "AVAILABLE",
      },
      order: { lastActiveAt: "DESC" },
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
    driver.lastActiveAt = new Date();
    return await this.driverRepository.save(driver);
  }

  async updateStatus(
    id: string,
    status: "AVAILABLE" | "BUSY" | "OFFLINE",
  ): Promise<Driver> {
    const driver = await this.findOne(id);
    driver.status = status;
    driver.lastActiveAt = new Date();
    return await this.driverRepository.save(driver);
  }

  async remove(id: string): Promise<void> {
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
