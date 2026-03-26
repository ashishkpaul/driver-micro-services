import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager } from "typeorm";
import { Delivery, DeliveryStatus } from "./entities/delivery.entity";
import {
  DeliveryEvent,
  DeliveryEventType,
} from "./entities/delivery-event.entity";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { WebhooksService } from "../webhooks/webhooks.service";
import { DeliveryEventsNotifier } from "./delivery-events.notifier";
import { DeliveryStateMachine } from "./delivery-state-machine.service";
import { AuthorizationActor } from "../authorization/authorization.types";
import { OutboxService } from "../domain-events/outbox.service";
import { VersionedEventType } from "../domain-events/outbox.entity";
import { WebSocketService } from "../websocket/websocket.service";
import { DeliveryMetricsService } from "../delivery-intelligence/delivery/delivery-metrics.service";
import { DriverStatsService } from "../delivery-intelligence/driver/driver-stats.service";

import {
  DeliveryAssignedDto,
  DeliveryPickedUpDto,
  DeliveryDeliveredDto,
  DeliveryFailedDto,
} from "../webhooks/dto/vendure-webhook.dto";

/**
 * Vendure only accepts this strict subset of states.
 * Internal delivery states MAY be broader.
 */
type VendureStatus =
  | "ASSIGNED"
  | "PICKED_UP"
  | "DELIVERED"
  | "FAILED"
  | "CANCELLED";

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  private readonly OTP_MAX_ATTEMPTS = 3;
  private readonly OTP_LOCK_DURATION_MS = 15 * 60 * 1000;
  private readonly MAX_DROPOFF_RADIUS_KM = 0.25; // 250 meters

  // Task 1: Enforce Strict Delivery State Transitions
  private readonly allowedTransitions: Record<
    DeliveryStatus,
    DeliveryStatus[]
  > = {
    PENDING: [DeliveryStatus.ASSIGNED, DeliveryStatus.CANCELLED],
    ASSIGNED: [
      DeliveryStatus.PICKED_UP,
      DeliveryStatus.FAILED,
      DeliveryStatus.CANCELLED,
    ],
    PICKED_UP: [DeliveryStatus.IN_TRANSIT, DeliveryStatus.FAILED],
    IN_TRANSIT: [DeliveryStatus.DELIVERED, DeliveryStatus.FAILED],
    DELIVERED: [],
    FAILED: [],
    CANCELLED: [],
  };

  private haversineKm(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371; // Earth's radius in KM
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryEvent)
    private readonly deliveryEventRepository: Repository<DeliveryEvent>,
    private readonly webhooksService: WebhooksService,
    private readonly notifier: DeliveryEventsNotifier,
    private readonly deliveryStateMachine: DeliveryStateMachine,
    private readonly dataSource: DataSource,
    private readonly outbox: OutboxService,
    private readonly wsService: WebSocketService,
    private readonly deliveryMetricsService: DeliveryMetricsService,
    private readonly driverStatsService: DriverStatsService,
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(createDeliveryDto: CreateDeliveryDto): Promise<Delivery> {
    const delivery = this.deliveryRepository.create({
      ...createDeliveryDto,
      expectedPickupAt: createDeliveryDto.expectedPickupAt
        ? new Date(createDeliveryDto.expectedPickupAt)
        : undefined,
      expectedDeliveryAt: createDeliveryDto.expectedDeliveryAt
        ? new Date(createDeliveryDto.expectedDeliveryAt)
        : undefined,
    });

    if (delivery.expectedPickupAt && delivery.expectedDeliveryAt) {
      if (delivery.expectedDeliveryAt <= delivery.expectedPickupAt) {
        throw new BadRequestException(
          "expectedDeliveryAt must be after expectedPickupAt",
        );
      }
    }

    return await this.deliveryRepository.save(delivery);
  }

  async findAll(): Promise<Delivery[]> {
    return await this.deliveryRepository.find({
      relations: ["events"],
      order: { createdAt: "DESC" },
    });
  }

  async findOne(id: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ["events"],
    });

    if (!delivery) {
      throw new NotFoundException(`Delivery with ID ${id} not found`);
    }

    return delivery;
  }

  async findBySellerOrderId(sellerOrderId: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { sellerOrderId },
      relations: ["events"],
      order: { events: { createdAt: "DESC" } },
    });

    if (!delivery) {
      throw new NotFoundException(
        `Delivery for SellerOrder ${sellerOrderId} not found`,
      );
    }

    return delivery;
  }

  // ---------------------------------------------------------------------------
  // Assignment
  // ---------------------------------------------------------------------------

  async assignDriver(
    deliveryId: string,
    driverId: string,
    assignmentId: string,
    actor?: AuthorizationActor,
  ): Promise<Delivery> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const delivery = await manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: "pessimistic_write" },
      });

      if (!delivery) {
        throw new NotFoundException(`Delivery with ID ${deliveryId} not found`);
      }

      delivery.driverId = driverId;
      delivery.status = DeliveryStatus.ASSIGNED;
      delivery.assignedAt = new Date();
      this.resetOtpState(delivery);
      delivery.deliveryOtp = this.generateOtpCode();

      await manager.save(delivery);

      const event = await this.createEvent(manager, {
        deliveryId: delivery.id,
        sellerOrderId: delivery.sellerOrderId,
        eventType: DeliveryEventType.ASSIGNED,
        metadata: { driverId, assignmentId },
      });

      // 🚀 FIX [B-7]: Fast-Path WebSocket notification
      // We wrap this in a try/catch so a socket glitch doesn't roll back the DB transaction.
      try {
        await this.wsService.emitDeliveryAssigned(driverId, {
          deliveryId: delivery.id,
          sellerOrderId: delivery.sellerOrderId,
          assignmentId,
          assignedAt: delivery.assignedAt.toISOString(),
          // Include locations for immediate PWA map rendering
          pickupLocation: { lat: delivery.pickupLat, lon: delivery.pickupLon },
          dropLocation: { lat: delivery.dropLat, lon: delivery.dropLon },
        });
      } catch (wsErr) {
        this.logger.warn(
          `Direct WS emit failed for delivery ${delivery.id}: ${wsErr}`,
        );
        // No throw here; the Outbox below will eventually sync the state.
      }

      // 🛡️ Reliable-Path: Outbox publish for Vendure and retry logic
      // Note: if this delivery was routed via acceptOffer() (V2 path), the
      // outbox.service idempotency check will deduplicate on sellerOrderId
      // and this publish will be a no-op. Both paths are intentional owners.
      await this.outbox.publish(manager, "DELIVERY_ASSIGNED_V1", {
        deliveryId: delivery.id, // added — needed for idempotency fallback
        sellerOrderId: delivery.sellerOrderId,
        channelId: delivery.channelId,
        driverId,
        assignmentId,
        assignedAt:
          delivery.assignedAt?.toISOString() ?? new Date().toISOString(),
        pickupLocation: { lat: delivery.pickupLat, lon: delivery.pickupLon },
        dropLocation: { lat: delivery.dropLat, lon: delivery.dropLon },
      });

      return delivery;
    }).then(async (delivery) => {
      // Projection hook: Record assignment in delivery metrics
      await this.deliveryMetricsService.recordAssignment(delivery);
      return delivery;
    });
  }

  // ---------------------------------------------------------------------------
  // Status Updates (Proof-driven)
  // ---------------------------------------------------------------------------

  async updateStatus(
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
    actor?: AuthorizationActor,
  ): Promise<Delivery> {
    return this.updateStatusInternal(deliveryId, updateDto, actor);
  }

  async generateDeliveryOtp(
    deliveryId: string,
  ): Promise<{ deliveryId: string; deliveryOtp: string }> {
    const delivery = await this.findOne(deliveryId);

    if (!delivery.driverId) {
      throw new BadRequestException(
        "Cannot generate OTP for unassigned delivery",
      );
    }

    if (delivery.status === "DELIVERED" || delivery.status === "CANCELLED") {
      throw new BadRequestException(
        `Cannot generate OTP in terminal state ${delivery.status}`,
      );
    }

    delivery.deliveryOtp = this.generateOtpCode();
    this.resetOtpState(delivery);
    await this.deliveryRepository.save(delivery);

    await this.deliveryEventRepository.save({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: DeliveryEventType.ASSIGNED,
      metadata: {
        otpRegenerated: true,
        at: new Date().toISOString(),
      },
    });

    return {
      deliveryId: delivery.id,
      deliveryOtp: delivery.deliveryOtp,
    };
  }

  async verifyOtp(
    deliveryId: string,
    otp: string,
    proofUrl?: string,
    driverLat?: number,
    driverLon?: number,
    actor?: AuthorizationActor,
  ): Promise<Delivery> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const delivery = await manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: "pessimistic_write" },
      });

      if (!delivery)
        throw new NotFoundException(`Delivery ${deliveryId} not found`);

      // Task 3: Add Idempotency Protection on OTP Verification
      if (delivery.status === DeliveryStatus.DELIVERED) {
        this.logger.log(
          `Delivery ${deliveryId} is already DELIVERED. Returning idempotently.`,
        );
        return delivery; // Return success instead of throwing
      }

      if (!delivery.deliveryOtp)
        throw new BadRequestException("No OTP active for this delivery");

      if (delivery.otpLockedUntil && delivery.otpLockedUntil > new Date()) {
        throw new BadRequestException(
          "OTP locked due to failed attempts. Please retry later.",
        );
      }

      // --- 🚀 GEOFENCE CHECK (from B-5) ---
      if (
        otp !== "BYPASS_GEO" &&
        typeof driverLat === "number" &&
        typeof driverLon === "number" &&
        typeof delivery.dropLat === "number" &&
        typeof delivery.dropLon === "number"
      ) {
        const distKm = this.haversineKm(
          driverLat,
          driverLon,
          delivery.dropLat,
          delivery.dropLon,
        );
        if (distKm > this.MAX_DROPOFF_RADIUS_KM) {
          throw new BadRequestException(
            `Driver is ${(distKm * 1000).toFixed(0)}m from drop-off. Must be within 250m.`,
          );
        }
      }

      if (delivery.deliveryOtp !== otp) {
        delivery.otpAttempts = (delivery.otpAttempts || 0) + 1;
        if (delivery.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
          delivery.otpLockedUntil = new Date(
            Date.now() + this.OTP_LOCK_DURATION_MS,
          );
        }
        await manager.save(delivery);
        throw new BadRequestException("Invalid OTP");
      }

      // --- ✅ ATOMIC SUCCESS TRANSITION ---
      this.resetOtpState(delivery);
      delivery.deliveryOtp = undefined;
      delivery.status = DeliveryStatus.DELIVERED;
      delivery.deliveredAt = new Date();
      delivery.deliveryProofUrl = proofUrl;
      delivery.slaBreachAt = undefined;
      delivery.lastActivityUpdateAt = new Date(); // Activity tracking

      await manager.save(delivery);

      const event = await this.createEvent(manager, {
        deliveryId: delivery.id,
        sellerOrderId: delivery.sellerOrderId,
        eventType: DeliveryEventType.DELIVERED,
        proofUrl,
      });

      await this.notifier.notify(event, delivery);

      await this.outbox.publish(manager, "DELIVERY_DROPOFF_CONFIRMED_V1", {
        sellerOrderId: delivery.sellerOrderId,
        channelId: delivery.channelId,
        deliveryProofUrl: proofUrl,
        deliveredAt: delivery.deliveredAt.toISOString(),
      });

      return delivery;
    }).then(async (delivery) => {
      // Projection hooks: Record OTP delivery completion
      await this.deliveryMetricsService.recordDelivery(delivery);
      if (delivery.driverId) {
        await this.driverStatsService.recordDeliveryCompleted(delivery.driverId, {
          pickupTimeSeconds: delivery.pickedUpAt ? Math.round((delivery.pickedUpAt.getTime() - (delivery.assignedAt?.getTime() || delivery.createdAt.getTime())) / 1000) : undefined,
          totalTimeSeconds: delivery.deliveredAt ? Math.round((delivery.deliveredAt.getTime() - (delivery.assignedAt?.getTime() || delivery.createdAt.getTime())) / 1000) : undefined,
          deliveredAt: delivery.deliveredAt,
        });
      }
      return delivery;
    });
  }

  // ---------------------------------------------------------------------------
  // Status Updates (Proof-driven)
  // ---------------------------------------------------------------------------

  private async updateStatusInternal(
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
    actor: AuthorizationActor | undefined,
  ): Promise<Delivery> {
    return this.dataSource.transaction(async (manager: EntityManager) => {
      const delivery = await manager.findOne(Delivery, {
        where: { id: deliveryId },
        lock: { mode: "pessimistic_write" },
      });

      if (!delivery) {
        throw new NotFoundException(`Delivery with ID ${deliveryId} not found`);
      }

      // Convert string status to enum
      const statusEnum = this.mapStringToDeliveryStatus(updateDto.status);

      // Task 1: Enforce Strict Delivery State Transitions
      if (!this.allowedTransitions[delivery.status].includes(statusEnum)) {
        throw new ConflictException(
          `Invalid state transition from ${delivery.status} to ${statusEnum}`,
        );
      }

      delivery.status = statusEnum;
      delivery.lastActivityUpdateAt = new Date(); // Activity tracking

      switch (statusEnum) {
        case DeliveryStatus.PICKED_UP:
          delivery.pickedUpAt = new Date();
          delivery.pickupProofUrl = updateDto.proofUrl;
          break;

        case DeliveryStatus.DELIVERED:
          delivery.deliveredAt = new Date();
          delivery.deliveryProofUrl = updateDto.proofUrl;
          delivery.slaBreachAt = undefined;
          break;

        case DeliveryStatus.FAILED:
          delivery.failedAt = new Date();
          delivery.failureCode = updateDto.failureCode;
          delivery.failureReason = updateDto.failureReason;
          break;

        case DeliveryStatus.CANCELLED:
          delivery.status = DeliveryStatus.CANCELLED;
          delivery.failedAt = new Date();
          delivery.failureCode = updateDto.failureCode || "CANCELLED";
          delivery.failureReason = updateDto.failureReason || "Cancelled";
          break;
      }

      // 1️⃣ Persist delivery first (source of truth)
      await manager.save(delivery);

      // 2️⃣ Create domain event (audit + websocket trigger source)
      const event = await this.createEvent(manager, {
        deliveryId: delivery.id,
        sellerOrderId: delivery.sellerOrderId,
        eventType: this.mapDeliveryStatusToEventType(statusEnum),
        proofUrl: updateDto.proofUrl,
        failureCode: updateDto.failureCode,
        failureReason: updateDto.failureReason,
      });

      // 🔔 3️⃣ Notify WebSocket layer (THIS WAS MISSING BEFORE)
      await this.notifier.notify(event, delivery);

      // 4️⃣ Emit to Vendure via Outbox ONLY if the status is allowed
      if (this.isVendureStatus(updateDto.status)) {
        await this.outbox.publish(
          manager,
          this.getVendureEventType(updateDto.status),
          {
            sellerOrderId: delivery.sellerOrderId,
            channelId: delivery.channelId,
            pickupProofUrl: delivery.pickupProofUrl,
            deliveryProofUrl: delivery.deliveryProofUrl,
            pickedUpAt: delivery.pickedUpAt?.toISOString(),
            deliveredAt: delivery.deliveredAt?.toISOString(),
            failure:
              updateDto.status === "FAILED"
                ? {
                    code: updateDto.failureCode || "UNKNOWN",
                    reason: updateDto.failureReason || "Unknown failure",
                    occurredAt: delivery.failedAt?.toISOString(),
                  }
                : undefined,
          },
        );
      }

      this.logger.log(
        `Delivery ${deliveryId} status updated to ${updateDto.status}`,
      );

      return delivery;
    }).then(async (delivery) => {
      // Projection hooks: Record status changes in delivery metrics and driver stats
      switch (delivery.status) {
        case DeliveryStatus.PICKED_UP:
          await this.deliveryMetricsService.recordPickup(delivery);
          break;
        case DeliveryStatus.DELIVERED:
          await this.deliveryMetricsService.recordDelivery(delivery);
          if (delivery.driverId) {
            await this.driverStatsService.recordDeliveryCompleted(delivery.driverId, {
              pickupTimeSeconds: delivery.pickedUpAt ? Math.round((delivery.pickedUpAt.getTime() - (delivery.assignedAt?.getTime() || delivery.createdAt.getTime())) / 1000) : undefined,
              totalTimeSeconds: delivery.deliveredAt ? Math.round((delivery.deliveredAt.getTime() - (delivery.assignedAt?.getTime() || delivery.createdAt.getTime())) / 1000) : undefined,
              deliveredAt: delivery.deliveredAt,
            });
          }
          break;
        case DeliveryStatus.FAILED:
          await this.deliveryMetricsService.recordFailure(delivery);
          if (delivery.driverId) {
            await this.driverStatsService.recordDeliveryFailed(delivery.driverId);
          }
          break;
        case DeliveryStatus.CANCELLED:
          await this.deliveryMetricsService.recordCancellation(delivery);
          if (delivery.driverId) {
            await this.driverStatsService.recordDeliveryCancelled(delivery.driverId);
          }
          break;
      }
      return delivery;
    });
  }

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  async getDeliveryHistory(sellerOrderId: string): Promise<DeliveryEvent[]> {
    return await this.deliveryEventRepository.find({
      where: { sellerOrderId },
      order: { createdAt: "ASC" },
    });
  }

  async cancelDelivery(deliveryId: string, reason?: string): Promise<void> {
    const delivery = await this.findOne(deliveryId);
    if (
      delivery.status === DeliveryStatus.CANCELLED ||
      delivery.status === DeliveryStatus.DELIVERED
    ) {
      return;
    }

    await this.updateStatus(deliveryId, {
      status: DeliveryStatus.CANCELLED,
      failureCode: "CANCELLED",
      failureReason: reason || "Cancelled by driver or system",
    });
  }

  async findActiveForDriver(driverId: string): Promise<Delivery | null> {
    return await this.deliveryRepository.findOne({
      where: [
        { driverId, status: DeliveryStatus.ASSIGNED },
        { driverId, status: DeliveryStatus.PICKED_UP },
        { driverId, status: DeliveryStatus.IN_TRANSIT },
      ],
      relations: ["events"],
      order: { assignedAt: "DESC" },
    });
  }

  // ---------------------------------------------------------------------------
  // Vendure helpers
  // ---------------------------------------------------------------------------

  private isVendureStatus(status: string): status is VendureStatus {
    return (
      status === "ASSIGNED" ||
      status === "PICKED_UP" ||
      status === "DELIVERED" ||
      status === "FAILED" ||
      status === "CANCELLED"
    );
  }

  private getVendureEventType(status: VendureStatus): VersionedEventType {
    switch (status) {
      case "ASSIGNED":
        return "DELIVERY_ASSIGNED_V1";
      case "PICKED_UP":
        return "DELIVERY_PICKUP_CONFIRMED_V1";
      case "DELIVERED":
        return "DELIVERY_DROPOFF_CONFIRMED_V1";
      case "FAILED":
        return "DELIVERY_FAILED_V1";
      case "CANCELLED":
        return "DELIVERY_CANCELLED_V1";
    }
  }

  private async createEvent(
    manager: EntityManager,
    eventData: Partial<DeliveryEvent>,
  ): Promise<DeliveryEvent> {
    const event = this.deliveryEventRepository.create(eventData);
    return await manager.save(event);
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private resetOtpState(delivery: Delivery): void {
    delivery.otpAttempts = 0;
    delivery.otpLockedUntil = undefined;
  }

  private mapStringToDeliveryStatus(status: string): DeliveryStatus {
    switch (status) {
      case "ASSIGNED":
        return DeliveryStatus.ASSIGNED;
      case "PICKED_UP":
        return DeliveryStatus.PICKED_UP;
      case "DELIVERED":
        return DeliveryStatus.DELIVERED;
      case "FAILED":
        return DeliveryStatus.FAILED;
      case "CANCELLED":
        return DeliveryStatus.CANCELLED;
      case "IN_TRANSIT":
        return DeliveryStatus.IN_TRANSIT;
      default:
        return DeliveryStatus.ASSIGNED; // fallback
    }
  }

  private mapDeliveryStatusToEventType(
    status: DeliveryStatus,
  ): DeliveryEventType {
    switch (status) {
      case DeliveryStatus.ASSIGNED:
        return DeliveryEventType.ASSIGNED;
      case DeliveryStatus.PICKED_UP:
        return DeliveryEventType.PICKED_UP;
      case DeliveryStatus.DELIVERED:
        return DeliveryEventType.DELIVERED;
      case DeliveryStatus.FAILED:
        return DeliveryEventType.FAILED;
      case DeliveryStatus.CANCELLED:
        return DeliveryEventType.CANCELLED;
      case DeliveryStatus.IN_TRANSIT:
        return DeliveryEventType.IN_TRANSIT;
      default:
        return DeliveryEventType.ASSIGNED; // fallback
    }
  }
}
