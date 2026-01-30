import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Delivery } from "./entities/delivery.entity";
import { DeliveryEvent } from "./entities/delivery-event.entity";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { WebhooksService } from "../webhooks/webhooks.service";
import { DeliveryEventsNotifier } from "./delivery-events.notifier";

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
  | "FAILED";

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryEvent)
    private readonly deliveryEventRepository: Repository<DeliveryEvent>,
    private readonly webhooksService: WebhooksService,
    private readonly notifier: DeliveryEventsNotifier, // ✅ FIXED
  ) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(createDeliveryDto: CreateDeliveryDto): Promise<Delivery> {
    const delivery = this.deliveryRepository.create(createDeliveryDto);
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
  ): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);

    delivery.driverId = driverId;
    delivery.status = "ASSIGNED";
    delivery.assignedAt = new Date();

    await this.deliveryRepository.save(delivery);

    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: "ASSIGNED",
      metadata: { driverId, assignmentId },
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
  ): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);

    delivery.status = updateDto.status;

    switch (updateDto.status) {
      case "PICKED_UP":
        delivery.pickedUpAt = new Date();
        delivery.pickupProofUrl = updateDto.proofUrl;
        break;

      case "DELIVERED":
        delivery.deliveredAt = new Date();
        delivery.deliveryProofUrl = updateDto.proofUrl;
        break;

      case "FAILED":
        delivery.failedAt = new Date();
        delivery.failureCode = updateDto.failureCode;
        delivery.failureReason = updateDto.failureReason;
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

  async getDeliveryHistory(
    sellerOrderId: string,
  ): Promise<DeliveryEvent[]> {
    return await this.deliveryEventRepository.find({
      where: { sellerOrderId },
      order: { createdAt: "ASC" },
    });
  }

  // ---------------------------------------------------------------------------
  // Vendure helpers
  // ---------------------------------------------------------------------------

  private isVendureStatus(
    status: string,
  ): status is VendureStatus {
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
}
