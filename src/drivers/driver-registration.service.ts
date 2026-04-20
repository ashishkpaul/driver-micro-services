import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DriversService } from "./drivers.service";
import { DriverCapabilityService } from "./driver-capability.service";
import { DriverRegistrationStatus } from "./enums/driver-registration-status.enum";
import { Driver } from "./entities/driver.entity";
import { OutboxService } from "../domain-events/outbox.service";
import { AuditService } from "../services/audit.service";
import { WS_EVENTS } from "../../../packages/ws-contracts";

@Injectable()
export class DriverRegistrationService {
  private readonly logger = new Logger(DriverRegistrationService.name);

  constructor(
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    private readonly driversService: DriversService,
    @Inject(forwardRef(() => OutboxService))
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
    private readonly driverCapabilityService: DriverCapabilityService,
  ) {}

  /**
   * Create driver from auth (called after OTP verification)
   */
  async createDriverFromAuth(
    email: string,
    googleSub?: string,
  ): Promise<Driver> {
    const existing = await this.driversService.findByEmail(email);
    if (existing) {
      return existing;
    }

    const driver = this.driverRepository.create({
      email,
      googleSub: googleSub || "",
      registrationStatus: DriverRegistrationStatus.PROFILE_INCOMPLETE,
    });
    await this.driverRepository.save(driver);

    await this.emitDriverRegistered(driver);
    return driver;
  }

  /**
   * Complete driver profile
   */
  async completeProfile(
    driverId: string,
    data: {
      name?: string;
      phone?: string;
      cityId?: string;
      vehicleType?: string;
      vehicleNumber?: string;
    },
  ): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) {
      throw new BadRequestException("Driver not found");
    }

    // Update driver fields
    if (data.name) driver.name = data.name;
    if (data.phone) driver.phone = data.phone;
    if (data.cityId) driver.cityId = data.cityId;
    if (data.vehicleType) driver.vehicleType = data.vehicleType;
    if (data.vehicleNumber) driver.vehicleNumber = data.vehicleNumber;

    // Check if profile is complete BEFORE saving
    const isComplete = !!(driver.name && driver.phone && driver.cityId);
    if (isComplete) {
      driver.registrationStatus = DriverRegistrationStatus.PENDING_APPROVAL;
    }

    // Single save with all changes
    const savedDriver = await this.driversService.save(driver);

    if (isComplete) {
      await this.emitProfileCompleted(savedDriver);
    }

    return savedDriver;
  }

  /**
   * Validate profile completeness
   */
  async isProfileComplete(driverId: string): Promise<boolean> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) return false;

    return !!(driver.name && driver.phone && driver.cityId);
  }

  /**
   * Request approval for driver
   */
  async requestApproval(driverId: string): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) {
      throw new BadRequestException("Driver not found");
    }

    if (!(await this.isProfileComplete(driverId))) {
      throw new BadRequestException("Profile is incomplete");
    }

    driver.registrationStatus = DriverRegistrationStatus.PENDING_APPROVAL;
    await this.driversService.save(driver);
    await this.emitApprovalRequested(driver);

    return driver;
  }

  /**
   * Approve driver (admin action)
   */
  async approveDriver(driverId: string, adminId: string): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) {
      throw new BadRequestException("Driver not found");
    }

    if (
      driver.registrationStatus !== DriverRegistrationStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException("Driver is not pending approval");
    }

    driver.registrationStatus = DriverRegistrationStatus.APPROVED;
    driver.isActive = true; // Activate the account so driver can login
    driver.approvedAt = new Date();
    driver.approvedById = adminId;
    await this.driversService.save(driver);

    await this.auditService.log({
      userId: adminId,
      action: "DRIVER_APPROVED",
      resourceType: "Driver",
      resourceId: driverId,
    });

    await this.emitDriverApproved(driver);

    return driver;
  }

  /**
   * Reject driver (admin action)
   */
  async rejectDriver(
    driverId: string,
    adminId: string,
    reason: string,
  ): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) {
      throw new BadRequestException("Driver not found");
    }

    if (
      driver.registrationStatus !== DriverRegistrationStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException("Driver is not pending approval");
    }

    driver.registrationStatus = DriverRegistrationStatus.REJECTED;
    driver.rejectionReason = reason;
    await this.driversService.save(driver);

    await this.auditService.log({
      userId: adminId,
      action: "DRIVER_REJECTED",
      resourceType: "Driver",
      resourceId: driverId,
      changes: { after: { reason } },
    });

    await this.emitDriverRejected(driver);

    return driver;
  }

  /**
   * Check if driver is eligible for dispatch
   */
  async isEligibleForDispatch(driverId: string): Promise<boolean> {
    const driver = await this.driversService.findById(driverId);
    if (!driver) return false;

    return driver.registrationStatus === DriverRegistrationStatus.APPROVED;
  }

  // Event emission methods
  private async emitDriverRegistered(driver: Driver): Promise<void> {
    try {
      await this.outboxService.publish(
        null,
        WS_EVENTS.DRIVER_REGISTERED as any,
        { driverId: driver.id, email: driver.email },
      );
    } catch (error) {
      this.logger.error("Failed to emit DRIVER_REGISTERED event", error);
    }
  }

  private async emitProfileCompleted(driver: Driver): Promise<void> {
    try {
      await this.outboxService.publish(
        null,
        WS_EVENTS.DRIVER_PROFILE_COMPLETED as any,
        { driverId: driver.id },
      );
    } catch (error) {
      this.logger.error("Failed to emit DRIVER_PROFILE_COMPLETED event", error);
    }
  }

  private async emitApprovalRequested(driver: Driver): Promise<void> {
    try {
      await this.outboxService.publish(
        null,
        WS_EVENTS.DRIVER_APPROVAL_REQUESTED as any,
        { driverId: driver.id, cityId: driver.cityId },
      );
    } catch (error) {
      this.logger.error(
        "Failed to emit DRIVER_APPROVAL_REQUESTED event",
        error,
      );
    }
  }

  private async emitDriverApproved(driver: Driver): Promise<void> {
    try {
      await this.outboxService.publish(
        null,
        WS_EVENTS.DRIVER_APPROVED as any,
        { driverId: driver.id },
      );
    } catch (error) {
      this.logger.error("Failed to emit DRIVER_APPROVED event", error);
    }
  }

  private async emitDriverRejected(driver: Driver): Promise<void> {
    try {
      await this.outboxService.publish(
        null,
        WS_EVENTS.DRIVER_REJECTED as any,
        { driverId: driver.id, reason: driver.rejectionReason },
      );
    } catch (error) {
      this.logger.error("Failed to emit DRIVER_REJECTED event", error);
    }
  }
}
