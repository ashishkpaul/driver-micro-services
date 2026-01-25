import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriversService } from '../drivers/drivers.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { Assignment } from './entities/assignment.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { WebhooksService } from '../webhooks/webhooks.service';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectRepository(Assignment)
    private assignmentRepository: Repository<Assignment>,
    private driversService: DriversService,
    private deliveriesService: DeliveriesService,
    private webhooksService: WebhooksService,
  ) {}

  async createAndAssignDelivery(
    sellerOrderId: string,
    channelId: string,
    pickupLat: number,
    pickupLon: number,
    dropLat: number,
    dropLon: number,
  ): Promise<string> {
    // 1. Create delivery record
    const delivery = await this.deliveriesService.create({
      sellerOrderId,
      channelId,
      pickupLat,
      pickupLon,
      dropLat,
      dropLon,
    });

    this.logger.log(`Created delivery ${delivery.id} for seller order ${sellerOrderId}`);

    // 2. Find and assign driver
    const driver = await this.findNearestAvailableDriver(pickupLat, pickupLon);
    
    if (!driver) {
      this.logger.warn(`No available drivers found for seller order ${sellerOrderId}`);
      return delivery.id;
    }

    // 3. Create assignment record
    const assignment = this.assignmentRepository.create({
      sellerOrderId,
      channelId,
      driverId: driver.id,
      distanceToPickup: this.driversService.calculateDistance(
        driver.currentLat,
        driver.currentLon,
        pickupLat,
        pickupLon,
      ),
      distancePickupToDrop: this.driversService.calculateDistance(
        pickupLat,
        pickupLon,
        dropLat,
        dropLon,
      ),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
    });

    await this.assignmentRepository.save(assignment);
    this.logger.log(`Created assignment ${assignment.id} for driver ${driver.id}`);

    // 4. Assign driver to delivery
    await this.deliveriesService.assignDriver(delivery.id, driver.id);

    // 5. Update driver status
    await this.driversService.updateStatus(driver.id, 'BUSY');

    // 6. Emit DELIVERY_ASSIGNED_V1 to Vendure
    await this.webhooksService.emitDeliveryAssigned({
      sellerOrderId,
      channelId,
      driverId: driver.id,
      assignmentId: assignment.id,
      assignedAt: new Date().toISOString(),
    });

    this.logger.log(`Successfully assigned driver ${driver.id} to delivery ${delivery.id}`);
    return delivery.id;
  }

  private async findNearestAvailableDriver(
    pickupLat: number,
    pickupLon: number,
  ): Promise<(Driver & { currentLat: number; currentLon: number }) | null> {
    const availableDrivers = await this.driversService.findAvailable();
    
    if (availableDrivers.length === 0) {
      return null;
    }

    // Calculate distance for each driver
    const driversWithDistance = availableDrivers
      .filter(
  (driver): driver is Driver & { currentLat: number; currentLon: number } =>
    typeof driver.currentLat === 'number' &&
    typeof driver.currentLon === 'number'
)

      .map(driver => ({
        driver,
        distance: this.driversService.calculateDistance(
          driver.currentLat,
          driver.currentLon,
          pickupLat,
          pickupLon,
        ),
      }))
      .sort((a, b) => a.distance - b.distance);

    if (driversWithDistance.length === 0) {
      return null;
    }

    return driversWithDistance[0].driver as Driver & { currentLat: number; currentLon: number };
  }

  async handleAssignmentResponse(
    assignmentId: string,
    status: 'ACCEPTED' | 'REJECTED',
    rejectionReason?: string,
  ): Promise<void> {
    const assignment = await this.assignmentRepository.findOne({
      where: { id: assignmentId },
    });

    if (!assignment) {
      throw new Error(`Assignment ${assignmentId} not found`);
    }

    assignment.status = status;
    assignment.rejectionReason = rejectionReason;

    await this.assignmentRepository.save(assignment);

    if (status === 'REJECTED') {
      // Handle driver rejection - could trigger reassignment in v2
      this.logger.warn(`Assignment ${assignmentId} rejected: ${rejectionReason}`);
      
      // Update driver status back to available
      await this.driversService.updateStatus(assignment.driverId, 'AVAILABLE');
      
      // Emit failure event
      await this.webhooksService.emitDeliveryFailed({
        sellerOrderId: assignment.sellerOrderId,
        channelId: assignment.channelId,
        failure: {
          code: 'DRIVER_REJECTED',
          reason: rejectionReason || 'Driver rejected assignment',
          occurredAt: new Date().toISOString(),
        },
      });
    }
  }

  async getAssignmentHistory(sellerOrderId: string): Promise<Assignment[]> {
    return await this.assignmentRepository.find({
      where: { sellerOrderId },
      order: { createdAt: 'DESC' },
    });
  }
}
