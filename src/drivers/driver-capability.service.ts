// src/drivers/driver-capability.service.ts
import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Driver } from "./entities/driver.entity";
import { RedisService } from "../redis/redis.service";
import { DriverStatus } from "./enums/driver-status.enum";
import { DriverRegistrationStatus } from "./enums/driver-registration-status.enum";

export interface CapabilityCheck {
  canAccept: boolean;
  reason?: string;
  constraints: {
    maxConcurrentDeliveries: number;
    currentActiveDeliveries: number;
    requiresVehicleVerification: boolean;
    requiresBackgroundCheck: boolean;
    zoneRestricted: boolean;
  };
}

@Injectable()
export class DriverCapabilityService {
  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly redisService: RedisService,
  ) {}

  async checkDeliveryAcceptanceCapability(
    driverId: string,
  ): Promise<CapabilityCheck> {
    const driver = await this.driverRepository.findOne({
      where: { id: driverId },
    });

    if (!driver) {
      return {
        canAccept: false,
        reason: "DRIVER_NOT_FOUND",
        constraints: this.defaultConstraints(),
      };
    }

    const constraints = await this.buildConstraints(driver);
    const checks = await Promise.all([
      this.checkActiveStatus(driver),
      this.checkCurrentStatus(driver),
      this.checkRegistrationStatus(driver),
      this.checkVehicleVerification(driver, constraints),
      this.checkConcurrentDeliveryLimit(driverId, constraints),
      this.checkZoneAvailability(driver),
      this.checkDocumentExpiry(driver),
    ]);

    const failedCheck = checks.find((c) => !c.passed);

    return {
      canAccept: !failedCheck,
      reason: failedCheck?.reason,
      constraints,
    };
  }

  private async buildConstraints(
    driver: Driver,
  ): Promise<CapabilityCheck["constraints"]> {
    // Get active delivery count from Redis for real-time accuracy
    const activeDeliveries = await this.redisService
      .getClient()
      .hget(`driver:${driver.id}:stats`, "activeDeliveries");

    return {
      maxConcurrentDeliveries: 3, // Configurable per city/zone
      currentActiveDeliveries: parseInt(activeDeliveries || "0", 10),
      requiresVehicleVerification:
        driver.vehicleType === "BIKE" || driver.vehicleType === "CAR",
      requiresBackgroundCheck: true, // Always required for production
      zoneRestricted: !!driver.zoneId,
    };
  }

  private checkActiveStatus(driver: Driver): {
    passed: boolean;
    reason?: string;
  } {
    if (!driver.isActive) {
      return { passed: false, reason: "DRIVER_INACTIVE" };
    }
    return { passed: true };
  }

  private checkCurrentStatus(driver: Driver): {
    passed: boolean;
    reason?: string;
  } {
    if (driver.status !== DriverStatus.AVAILABLE) {
      return {
        passed: false,
        reason: `DRIVER_STATUS_${driver.status}`,
      };
    }
    return { passed: true };
  }

  private checkRegistrationStatus(driver: Driver): {
    passed: boolean;
    reason?: string;
  } {
    if (driver.registrationStatus !== DriverRegistrationStatus.APPROVED) {
      return {
        passed: false,
        reason: `DRIVER_REGISTRATION_${driver.registrationStatus}`,
      };
    }
    return { passed: true };
  }

  private checkVehicleVerification(
    driver: Driver,
    constraints: CapabilityCheck["constraints"],
  ): { passed: boolean; reason?: string } {
    if (constraints.requiresVehicleVerification && !driver.vehicleNumber) {
      return { passed: false, reason: "VEHICLE_NOT_REGISTERED" };
    }
    return { passed: true };
  }

  private async checkConcurrentDeliveryLimit(
    driverId: string,
    constraints: CapabilityCheck["constraints"],
  ): Promise<{ passed: boolean; reason?: string }> {
    if (
      constraints.currentActiveDeliveries >= constraints.maxConcurrentDeliveries
    ) {
      return { passed: false, reason: "MAX_CONCURRENT_DELIVERIES_REACHED" };
    }
    return { passed: true };
  }

  private checkZoneAvailability(driver: Driver): {
    passed: boolean;
    reason?: string;
  } {
    // Check if driver's zone is currently serviceable (e.g., not under curfew)
    // This would integrate with zone service
    return { passed: true };
  }

  private checkDocumentExpiry(driver: Driver): {
    passed: boolean;
    reason?: string;
  } {
    // Check if any required documents are expired
    // This would integrate with document verification service
    return { passed: true };
  }

  private defaultConstraints(): CapabilityCheck["constraints"] {
    return {
      maxConcurrentDeliveries: 0,
      currentActiveDeliveries: 0,
      requiresVehicleVerification: true,
      requiresBackgroundCheck: true,
      zoneRestricted: false,
    };
  }

  /**
   * Real-time capability check for specific delivery offer
   */
  async canAcceptSpecificDelivery(
    driverId: string,
    deliveryId: string,
    pickupDistanceKm: number,
  ): Promise<{ canAccept: boolean; reason?: string }> {
    const baseCapability =
      await this.checkDeliveryAcceptanceCapability(driverId);

    if (!baseCapability.canAccept) {
      return { canAccept: false, reason: baseCapability.reason };
    }

    // Additional delivery-specific checks
    if (pickupDistanceKm > 15) {
      return { canAccept: false, reason: "PICKUP_DISTANCE_EXCEEDS_LIMIT" };
    }

    // Check if driver has already rejected this delivery
    const rejectionCount = await this.redisService
      .getClient()
      .hget(`delivery:${deliveryId}:rejections`, driverId);

    if (rejectionCount && parseInt(rejectionCount, 10) >= 2) {
      return { canAccept: false, reason: "MAX_REJECTIONS_EXCEEDED" };
    }

    return { canAccept: true };
  }
}
