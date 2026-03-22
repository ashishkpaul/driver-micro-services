import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In, LessThan, DataSource } from "typeorm";
import { Cron } from "@nestjs/schedule";
import { RedisService } from "../redis/redis.service";

import { DriverOffer, DriverOfferStatus } from "./entities/driver-offer.entity";
import { Driver } from "../drivers/entities/driver.entity";
import {
  Delivery,
  DeliveryStatus,
} from "../deliveries/entities/delivery.entity";
import { Assignment } from "../assignment/entities/assignment.entity";
import { DriverStatus } from "../drivers/enums/driver-status.enum";
import { DriverCapabilityService } from "../drivers/driver-capability.service";
import { OutboxService } from "../domain-events/outbox.service"; // ADDED
import { WebSocketService } from "../websocket/websocket.service"; // ADDED

import { CreateOfferDto } from "./dto/create-offer.dto";
import { AcceptOfferDto } from "./dto/accept-offer.dto";
import { RejectOfferDto } from "./dto/reject-offer.dto";

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    @InjectRepository(DriverOffer)
    private readonly driverOfferRepository: Repository<DriverOffer>,
    @InjectRepository(Driver)
    private readonly driverRepository: Repository<Driver>,
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(Assignment)
    private readonly assignmentRepository: Repository<Assignment>,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly driverCapabilityService: DriverCapabilityService,
    private readonly outbox: OutboxService, // ADDED
    private readonly wsService: WebSocketService, // ADDED
  ) {}

  async createOfferForDriver(createOfferDto: CreateOfferDto): Promise<{
    success: boolean;
    offerId: string;
    expiresAt: string;
    payload: any;
  }> {
    const { driverId, deliveryId, expiresInSeconds = 30 } = createOfferDto;

    // Validate driver exists and is available
    const driver = await this.driverRepository.findOne({
      where: { id: driverId },
    });
    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found`);
    }

    if (driver.status !== "AVAILABLE") {
      throw new ConflictException(`Driver ${driverId} is not available`);
    }

    const capability =
      await this.driverCapabilityService.checkDeliveryAcceptanceCapability(
        driverId,
      );
    if (!capability.canAccept) {
      throw new ConflictException(
        `Driver ${driverId} cannot receive offer: ${capability.reason || "CAPABILITY_REJECTED"}`,
      );
    }

    // Validate delivery exists and is ready
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    if (delivery.status !== "PENDING") {
      throw new ConflictException(
        `Delivery ${deliveryId} is not ready for assignment`,
      );
    }

    // Calculate offer payload
    const offerPayload = await this.calculateOfferPayload(delivery, driver);

    // Create offer
    const offer = this.driverOfferRepository.create({
      deliveryId,
      driverId,
      status: DriverOfferStatus.PENDING,
      offerPayload,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    });

    const savedOffer = await this.driverOfferRepository.save(offer);

    // Set Redis keys for V2 intent - fast lookup and invalidation
    const redisClient = this.redisService.getClient();
    const pipeline = redisClient.pipeline();

    // Individual offer lookup
    pipeline.setex(
      `offer:${savedOffer.id}`,
      expiresInSeconds,
      JSON.stringify({ driverId, deliveryId }),
    );

    // Delivery-to-offers mapping
    pipeline.zadd(
      `delivery:${deliveryId}:offers`,
      Date.now() + expiresInSeconds * 1000,
      savedOffer.id,
    );

    // Driver-to-offers mapping
    pipeline.sadd(`driver:${driverId}:offers`, savedOffer.id);
    pipeline.expire(`driver:${driverId}:offers`, expiresInSeconds);

    await pipeline.exec();

    // Emit offer to driver over WebSocket (real-time offer card in PWA)
    await this.wsService.emitToDriver(driverId, "OFFER_CREATED_V2", {
      offerId: savedOffer.id,
      deliveryId,
      expiresAt: savedOffer.expiresAt.toISOString(),
      offerPayload,
    });

    return {
      success: true,
      offerId: savedOffer.id,
      expiresAt: savedOffer.expiresAt ? savedOffer.expiresAt.toISOString() : "",
      payload: offerPayload,
    };
  }

  async acceptOffer(acceptOfferDto: AcceptOfferDto): Promise<{
    success: boolean;
    assignmentId: string;
    deliveryId: string;
    driverId: string;
    responseTimeMs: number;
  }> {
    const { offerId, driverId, acceptedAt: acceptedAtStr } = acceptOfferDto;
    const acceptedAt = new Date(acceptedAtStr);

    return this.dataSource.transaction(async (manager) => {
      // 1. Lock the offer row using pessimistic write
      const offer = await manager.findOne(DriverOffer, {
        where: { id: offerId },
        lock: { mode: "pessimistic_write" },
      });

      if (!offer) {
        throw new NotFoundException("Offer not found");
      }

      if (offer.driverId !== driverId) {
        throw new BadRequestException("Invalid driver for this offer");
      }

      if (offer.status !== "PENDING") {
        throw new BadRequestException("Offer is no longer available");
      }

      if (offer.expiresAt < new Date()) {
        throw new BadRequestException("Offer has expired");
      }

      const capability =
        await this.driverCapabilityService.checkDeliveryAcceptanceCapability(
          driverId,
        );
      if (!capability.canAccept) {
        throw new BadRequestException(
          `Driver ${driverId} cannot accept offer: ${capability.reason || "CAPABILITY_REJECTED"}`,
        );
      }

      // Calculate response time
      const responseTimeMs = acceptedAt.getTime() - offer.createdAt.getTime();

      // 2. Mark offer as accepted
      offer.status = DriverOfferStatus.ACCEPTED;
      offer.acceptedAt = acceptedAt;
      offer.driverResponseTimeMs = responseTimeMs;
      await manager.save(offer);

      // 3. Mark all competing offers for this delivery as REJECTED
      await manager.update(
        DriverOffer,
        { deliveryId: offer.deliveryId, status: DriverOfferStatus.PENDING },
        { status: DriverOfferStatus.REJECTED },
      );

      // 4. Load + lock + mutate + save delivery
      // Replaces manager.update() — we need assignedAt and deliveryOtp set,
      // which requires loading the entity first (update() doesn't call setters).
      const delivery = await manager.findOne(Delivery, {
        where: { id: offer.deliveryId },
        lock: { mode: "pessimistic_write" },
      });

      if (!delivery) {
        throw new NotFoundException(
          `Delivery ${offer.deliveryId} not found during offer acceptance`,
        );
      }

      // Set all assignment fields atomically in the same transaction
      delivery.driverId = driverId;
      delivery.status = DeliveryStatus.ASSIGNED;
      delivery.assignedAt = new Date();
      delivery.otpAttempts = 0;
      delivery.otpLockedUntil = undefined;
      // generateOtpCode() is private on DeliversService — inline equivalent here
      delivery.deliveryOtp = Math.floor(
        100000 + Math.random() * 900000,
      ).toString();

      await manager.save(delivery);

      // Create assignment with the CORRECT ID
      const assignment = this.assignmentRepository.create({
        sellerOrderId: delivery.sellerOrderId, // FIXED: Now uses Vendure ID, not internal UUID
        driverId,
      });
      const savedAssignment = await manager.save(assignment);

      // Mark driver as BUSY
      await manager.update(Driver, driverId, { status: DriverStatus.BUSY });

      // 6. Publish outbox event (ADDED)
      // This triggers DeliveryAssignedHandler -> WebSocket + Vendure webhook
      await this.outbox.publish(manager, "DELIVERY_ASSIGNED_V1", {
        deliveryId: offer.deliveryId,
        sellerOrderId: delivery.sellerOrderId,
        channelId: delivery.channelId,
        driverId,
        assignmentId: savedAssignment.id,
        assignedAt: new Date().toISOString(),
        pickupLocation: { lat: delivery.pickupLat, lon: delivery.pickupLon },
        dropLocation: { lat: delivery.dropLat, lon: delivery.dropLon },
      });

      return {
        success: true,
        assignmentId: savedAssignment.id,
        deliveryId: offer.deliveryId,
        driverId,
        responseTimeMs,
      };
    });
  }

  async rejectOffer(rejectOfferDto: RejectOfferDto): Promise<{
    success: boolean;
    nextOfferId?: string;
    reason: string;
  }> {
    const { offerId, driverId, reason } = rejectOfferDto;

    const offer = await this.driverOfferRepository.findOne({
      where: { id: offerId },
    });

    if (!offer) throw new NotFoundException("Offer not found");
    if (offer.driverId !== driverId)
      throw new BadRequestException("Invalid driver");
    if (offer.status !== "PENDING")
      throw new ConflictException("Offer already processed");

    // 1. Persist the rejection
    offer.status = DriverOfferStatus.REJECTED;
    offer.rejectedAt = new Date();
    if (reason) offer.rejectionReason = reason;
    await this.driverOfferRepository.save(offer);

    // 🚀 FIX [B-6]: Trigger the next candidate in the queue
    await this.triggerNextCandidate(offer.deliveryId);

    return {
      success: true,
      reason: reason || "other",
    };
  }

  async getDriverOffers(driverId: string): Promise<DriverOffer[]> {
    return this.driverOfferRepository.find({
      where: { driverId },
      order: { createdAt: "DESC" },
    });
  }

  async getDeliveryOffers(deliveryId: string): Promise<DriverOffer[]> {
    return this.driverOfferRepository.find({
      where: { deliveryId },
      order: { createdAt: "DESC" },
    });
  }

  @Cron("*/10 * * * * *")
  async expireOffers(): Promise<void> {
    const result = await this.driverOfferRepository
      .createQueryBuilder()
      .update(DriverOffer)
      .set({ status: DriverOfferStatus.EXPIRED })
      .where("status = :status AND expires_at < :now", {
        status: DriverOfferStatus.PENDING,
        now: new Date(),
      })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.log(`Expired ${result.affected} stale offer(s)`);
    }
  }

  private async calculateOfferPayload(
    delivery: Delivery,
    driver: Driver,
  ): Promise<any> {
    // Simplified offer payload calculation
    const estimatedPickupTimeMin = 10; // Simplified
    const estimatedEarning = 100; // Simplified

    return {
      pickupLocation: {
        lat: delivery.pickupLat,
        lon: delivery.pickupLon,
      },
      pickupStoreName: "Store Name", // Simplified
      estimatedPickupTimeMin,
      estimatedDeliveryTime: new Date(
        Date.now() + (estimatedPickupTimeMin + 10) * 60000,
      ).toISOString(),
      estimatedDistanceKm: 5, // Simplified
      estimatedEarning,
    };
  }

  private async triggerNextCandidate(deliveryId: string): Promise<void> {
    // 1. Reload delivery and verify it still needs a driver
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery || delivery.status !== "PENDING") {
      return; // Already assigned, cancelled, or doesn't exist
    }

    // 2. Identify drivers who have already rejected or been offered this delivery
    const previousOffers = await this.driverOfferRepository.find({
      where: { deliveryId },
      select: ["driverId"],
    });
    const excludedDriverIds = previousOffers.map((o) => o.driverId);

    // 3. Find all currently available drivers
    const candidates = await this.driverRepository.find({
      where: { status: DriverStatus.AVAILABLE },
    });

    // 4. Select the first available driver not in the exclusion list
    const nextDriver = candidates.find(
      (d) => !excludedDriverIds.includes(d.id),
    );

    if (!nextDriver) {
      // ⚠️ CRITICAL: All available drivers have been exhausted
      this.logger.warn(
        `Exhausted all candidates for delivery ${deliveryId}. Manual intervention required.`,
      );
      // Future: Trigger an SNS/SLA alert to the Operations Dashboard here
      return;
    }

    // 5. Dispatch a fresh offer to the next driver
    await this.createOfferForDriver({
      driverId: nextDriver.id,
      deliveryId,
      expiresInSeconds: 30, // Standard PWA offer window
    });
  }
}
