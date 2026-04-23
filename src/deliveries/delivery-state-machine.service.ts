import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource, Not } from "typeorm";
import {
  DriverOffer,
  DriverOfferStatus,
} from "../offers/entities/driver-offer.entity";
import { Delivery, DeliveryStatus } from "./entities/delivery.entity";
import { Assignment } from "../assignment/entities/assignment.entity";
import { Driver } from "../drivers/entities/driver.entity";
import { DriverStatus } from "../drivers/enums/driver-status.enum";
import { OutboxService } from "../domain-events/outbox.service";
import { DriverStatsService } from "../delivery-intelligence/driver/driver-stats.service";

@Injectable()
export class DeliveryStateMachine {
  private readonly logger = new Logger(DeliveryStateMachine.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private outbox: OutboxService,
    private driverStatsService: DriverStatsService,
  ) {}

  private assertValidAssignment(delivery: Delivery): void {
    if (delivery.driverId) {
      throw new ConflictException("DELIVERY_ALREADY_ASSIGNED");
    }

    if (delivery.status !== "PENDING") {
      throw new ConflictException("INVALID_DELIVERY_STATE");
    }
  }

  async acceptOffer(offerId: string, driverId: string) {
    this.logger.log(
      `[PHASE 5] Driver accepting offer | offerId=${offerId} | driverId=${driverId}`,
    );
    return this.dataSource.transaction(async (manager) => {
      // 1. Load and lock offer
      const offer = await manager.findOne(DriverOffer, {
        where: { id: offerId, driverId },
        lock: { mode: "pessimistic_write" },
      });

      if (!offer) {
        throw new NotFoundException("OFFER_NOT_FOUND");
      }

      if (offer.status !== "PENDING") {
        throw new ConflictException("OFFER_ALREADY_USED");
      }

      if (offer.expiresAt < new Date()) {
        throw new ConflictException("OFFER_EXPIRED");
      }

      // 2. Load and lock delivery
      const delivery = await manager.findOne(Delivery, {
        where: { id: offer.deliveryId },
        lock: { mode: "pessimistic_write" },
      });

      if (!delivery) {
        throw new NotFoundException("DELIVERY_NOT_FOUND");
      }

      this.assertValidAssignment(delivery);

      // 2.5. Validate offer ownership
      if (offer.driverId !== driverId) {
        throw new ConflictException("OFFER_NOT_FOR_DRIVER");
      }

      // 3. Accept offer
      offer.status = DriverOfferStatus.ACCEPTED;
      offer.acceptedAt = new Date();
      await manager.save(offer);

      // 4. Assign delivery
      delivery.status = DeliveryStatus.ASSIGNED;
      delivery.driverId = driverId;
      delivery.assignedAt = new Date();
      await manager.save(delivery);

      // 5. Create assignment
      const assignment = manager.create(Assignment, {
        driverId,
        sellerOrderId: delivery.sellerOrderId,
      });
      await manager.save(assignment);

      // 6. Mark driver busy
      await manager.update(
        Driver,
        { id: driverId },
        { status: DriverStatus.BUSY },
      );

      // 7. Expire competing offers
      await manager.update(
        DriverOffer,
        {
          deliveryId: delivery.id,
          status: DriverOfferStatus.PENDING,
          id: Not(offer.id),
        },
        { status: DriverOfferStatus.EXPIRED },
      );

      // 8. Publish outbox event
      await this.outbox.publish(manager, "DELIVERY_ASSIGNED_V1", {
        deliveryId: delivery.id,
        driverId,
        assignmentId: assignment.id,
      });

      this.logger.log(
        `[PHASE 5] Offer accepted | offerId=${offerId} | driverId=${driverId} | deliveryId=${delivery.id} | assignmentId=${assignment.id} | delivery.status=ASSIGNED | driver.status=BUSY`,
      );

      return {
        success: true,
      };
    }).then(async () => {
      // Projection hook: Record assignment acceptance in driver stats
      await this.driverStatsService.recordAssignmentAccepted(driverId);
      return { success: true };
    });
  }
}
