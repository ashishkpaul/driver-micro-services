import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Delivery } from "./entities/delivery.entity";
import { DeliveryEvent } from "./entities/delivery-event.entity";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { WebhooksService } from "../webhooks/webhooks.service";
import { DeliveryEventsNotifier } from "./delivery-events.notifier";
import { DeliveryStateMachine } from "./delivery-state-machine.service";
import { AuthorizationActor } from "../authorization/authorization.types";

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
type VendureStatus = "ASSIGNED" | "PICKED_UP" | "DELIVERED" | "FAILED";

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);
  private readonly OTP_MAX_ATTEMPTS = 3;
  private readonly OTP_LOCK_DURATION_MS = 15 * 60 * 1000;

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryEvent)
    private readonly deliveryEventRepository: Repository<DeliveryEvent>,
    private readonly webhooksService: WebhooksService,
    private readonly notifier: DeliveryEventsNotifier,
    private readonly deliveryStateMachine: DeliveryStateMachine,
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
    const delivery = await this.findOne(deliveryId);
    await this.deliveryStateMachine.assertTransitionAllowed(
      delivery,
      "ASSIGNED",
      actor,
    );

    delivery.driverId = driverId;
    delivery.status = "ASSIGNED";
    delivery.assignedAt = new Date();
    this.resetOtpState(delivery);
    delivery.deliveryOtp = this.generateOtpCode();

    await this.deliveryRepository.save(delivery);

    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: "ASSIGNED",
      metadata: {
        driverId,
        assignmentId,
        deliveryOtpGenerated: true,
      },
    });

    // Emit ASSIGNED to Vendure (allowed)
    await this.emitToVendure("ASSIGNED", {
      sellerOrderId: delivery.sellerOrderId,
      channelId: delivery.channelId,
      driverId,
      assignmentId,
      assignedAt: delivery.assignedAt.toISOString(),
    });

    return delivery;
  }

  // ---------------------------------------------------------------------------
  // Status Updates (Proof-driven)
  // ---------------------------------------------------------------------------

  async updateStatus(
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
    actor?: AuthorizationActor,
  ): Promise<Delivery> {
    return this.updateStatusInternal(deliveryId, updateDto, actor, false);
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

    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: "ASSIGNED",
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

  async verifyDeliveryOtp(
    deliveryId: string,
    otp: string,
    proofUrl?: string,
    actor?: AuthorizationActor,
  ): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);

    if (!delivery.deliveryOtp) {
      throw new BadRequestException("No OTP is active for this delivery");
    }

    if (delivery.otpLockedUntil && delivery.otpLockedUntil > new Date()) {
      throw new BadRequestException(
        "OTP locked due to failed attempts. Please retry later.",
      );
    }

    if (delivery.deliveryOtp !== otp) {
      delivery.otpAttempts = (delivery.otpAttempts || 0) + 1;
      if (delivery.otpAttempts >= this.OTP_MAX_ATTEMPTS) {
        delivery.otpLockedUntil = new Date(
          Date.now() + this.OTP_LOCK_DURATION_MS,
        );
      }
      await this.deliveryRepository.save(delivery);
      throw new BadRequestException("Invalid OTP");
    }

    this.resetOtpState(delivery);
    delivery.deliveryOtp = undefined;
    await this.deliveryRepository.save(delivery);

    return this.updateStatusInternal(
      deliveryId,
      {
        status: "DELIVERED",
        proofUrl,
      },
      actor,
      true,
    );
  }

  // ---------------------------------------------------------------------------
  // Status Updates (Proof-driven)
  // ---------------------------------------------------------------------------

  private async updateStatusInternal(
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
    actor: AuthorizationActor | undefined,
    skipOtpCheck: boolean,
  ): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);

    await this.deliveryStateMachine.assertTransitionAllowed(
      delivery,
      updateDto.status,
      actor,
    );

    if (
      updateDto.status === "DELIVERED" &&
      !skipOtpCheck &&
      Boolean(delivery.deliveryOtp)
    ) {
      throw new BadRequestException(
        "OTP verification required before marking as DELIVERED",
      );
    }

    delivery.status = updateDto.status;

    switch (updateDto.status) {
      case "PICKED_UP":
        delivery.pickedUpAt = new Date();
        delivery.pickupProofUrl = updateDto.proofUrl;
        break;

      case "DELIVERED":
        delivery.deliveredAt = new Date();
        delivery.deliveryProofUrl = updateDto.proofUrl;
        delivery.slaBreachAt = undefined;
        break;

      case "FAILED":
        delivery.failedAt = new Date();
        delivery.failureCode = updateDto.failureCode;
        delivery.failureReason = updateDto.failureReason;
        break;

      case "CANCELLED":
        delivery.status = "CANCELLED";
        delivery.failedAt = new Date();
        delivery.failureCode = updateDto.failureCode || "CANCELLED";
        delivery.failureReason = updateDto.failureReason || "Cancelled";
        break;
    }

    // 1️⃣ Persist delivery first (source of truth)
    await this.deliveryRepository.save(delivery);

    // 2️⃣ Create domain event (audit + websocket trigger source)
    const event = await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: updateDto.status,
      proofUrl: updateDto.proofUrl,
      failureCode: updateDto.failureCode,
      failureReason: updateDto.failureReason,
    });

    // 🔔 3️⃣ Notify WebSocket layer (THIS WAS MISSING BEFORE)
    await this.notifier.notify(event, delivery);

    // 4️⃣ Emit to Vendure ONLY if the status is allowed
    if (this.isVendureStatus(updateDto.status)) {
      await this.emitToVendure(updateDto.status, {
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
      });
    }

    this.logger.log(
      `Delivery ${deliveryId} status updated to ${updateDto.status}`,
    );

    return delivery;
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
    if (delivery.status === "CANCELLED" || delivery.status === "DELIVERED") {
      return;
    }

    await this.updateStatus(deliveryId, {
      status: "CANCELLED",
      failureCode: "CANCELLED",
      failureReason: reason || "Cancelled by driver or system",
    });

    await this.webhooksService.emitDeliveryCancelled({
      sellerOrderId: delivery.sellerOrderId,
      channelId: delivery.channelId,
      reason: reason || "Cancelled by driver or system",
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
      status === "FAILED"
    );
  }

  private async emitToVendure(
    status: VendureStatus,
    data: unknown,
  ): Promise<void> {
    switch (status) {
      case "ASSIGNED":
        await this.webhooksService.emitDeliveryAssigned(
          data as DeliveryAssignedDto,
        );
        break;

      case "PICKED_UP":
        await this.webhooksService.emitDeliveryPickedUp(
          data as DeliveryPickedUpDto,
        );
        break;

      case "DELIVERED":
        await this.webhooksService.emitDeliveryDelivered(
          data as DeliveryDeliveredDto,
        );
        break;

      case "FAILED":
        await this.webhooksService.emitDeliveryFailed(
          data as DeliveryFailedDto,
        );
        break;
    }
  }

  private async createEvent(
    eventData: Partial<DeliveryEvent>,
  ): Promise<DeliveryEvent> {
    const event = this.deliveryEventRepository.create(eventData);
    return await this.deliveryEventRepository.save(event);
  }

  private generateOtpCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private resetOtpState(delivery: Delivery): void {
    delivery.otpAttempts = 0;
    delivery.otpLockedUntil = undefined;
  }
}
