import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DeliveryAssignedDto, DeliveryPickedUpDto, DeliveryDeliveredDto, DeliveryFailedDto } from '../webhooks/dto/vendure-webhook.dto';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  // Only these states are emitted to Vendure:
  private readonly VENDURE_V1_STATES = ['ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED'] as const;

  constructor(
    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryEvent)
    private deliveryEventRepository: Repository<DeliveryEvent>,
    private webhooksService: WebhooksService,
  ) {}

  async create(createDeliveryDto: CreateDeliveryDto): Promise<Delivery> {
    const delivery = this.deliveryRepository.create(createDeliveryDto);
    return await this.deliveryRepository.save(delivery);
  }

  async findAll(): Promise<Delivery[]> {
    return await this.deliveryRepository.find({
      relations: ['events'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id },
      relations: ['events'],
    });
    
    if (!delivery) {
      throw new NotFoundException(`Delivery with ID ${id} not found`);
    }
    
    return delivery;
  }

  async findBySellerOrderId(sellerOrderId: string): Promise<Delivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { sellerOrderId },
      relations: ['events'],
      order: { events: { createdAt: 'DESC' } },
    });
    
    if (!delivery) {
      throw new NotFoundException(`Delivery for SellerOrder ${sellerOrderId} not found`);
    }
    
    return delivery;
  }

  async assignDriver(deliveryId: string, driverId: string, assignmentId: string): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);
    
    delivery.driverId = driverId;
    delivery.status = 'ASSIGNED';
    delivery.assignedAt = new Date();
    
    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: 'ASSIGNED',
      metadata: { driverId, assignmentId },
    });

    // Emit ASSIGNED event to Vendure (v1-allowed state)
    await this.emitToVendureIfAllowed('ASSIGNED', {
      sellerOrderId: delivery.sellerOrderId,
      channelId: delivery.channelId,
      driverId,
      assignmentId,
      assignedAt: delivery.assignedAt.toISOString(),
    });
    
    return await this.deliveryRepository.save(delivery);
  }

  async updateStatus(
    deliveryId: string,
    updateDto: UpdateDeliveryStatusDto,
  ): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);
    
    delivery.status = updateDto.status;
    
    // Update timestamps based on status
    switch (updateDto.status) {
      case 'PICKED_UP':
        delivery.pickedUpAt = new Date();
        delivery.pickupProofUrl = updateDto.proofUrl;
        // Emit PICKED_UP event to Vendure (v1-allowed state)
        await this.emitToVendureIfAllowed('PICKED_UP', {
          sellerOrderId: delivery.sellerOrderId,
          channelId: delivery.channelId,
          pickupProofUrl: updateDto.proofUrl,
          pickedUpAt: delivery.pickedUpAt.toISOString(),
        });
        break;
      case 'DELIVERED':
        delivery.deliveredAt = new Date();
        delivery.deliveryProofUrl = updateDto.proofUrl;
        // Emit DELIVERED event to Vendure (v1-allowed state)
        await this.emitToVendureIfAllowed('DELIVERED', {
          sellerOrderId: delivery.sellerOrderId,
          channelId: delivery.channelId,
          deliveryProofUrl: updateDto.proofUrl,
          deliveredAt: delivery.deliveredAt.toISOString(),
        });
        break;
      case 'FAILED':
        delivery.failedAt = new Date();
        delivery.failureCode = updateDto.failureCode;
        delivery.failureReason = updateDto.failureReason;
        // Emit FAILED event to Vendure (v1-allowed state)
        await this.emitToVendureIfAllowed('FAILED', {
          sellerOrderId: delivery.sellerOrderId,
          channelId: delivery.channelId,
          failure: {
            code: updateDto.failureCode || 'UNKNOWN',
            reason: updateDto.failureReason || 'Unknown failure',
            occurredAt: delivery.failedAt.toISOString(),
          },
        });
        break;
    }
    
    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: updateDto.status,
      proofUrl: updateDto.proofUrl,
      failureCode: updateDto.failureCode,
      failureReason: updateDto.failureReason,
    });
    
    this.logger.log(`Delivery ${deliveryId} status updated to ${updateDto.status}`);
    return await this.deliveryRepository.save(delivery);
  }

  async getDeliveryHistory(sellerOrderId: string): Promise<DeliveryEvent[]> {
    return await this.deliveryEventRepository.find({
      where: { sellerOrderId },
      order: { createdAt: 'ASC' },
    });
  }

  private async emitToVendureIfAllowed(
    status: string, 
    data: any
  ): Promise<void> {
    if (this.VENDURE_V1_STATES.includes(status as any)) {
      switch (status) {
        case 'ASSIGNED':
          await this.webhooksService.emitDeliveryAssigned(data);
          break;
        case 'PICKED_UP':
          await this.webhooksService.emitDeliveryPickedUp(data);
          break;
        case 'DELIVERED':
          await this.webhooksService.emitDeliveryDelivered(data);
          break;
        case 'FAILED':
          await this.webhooksService.emitDeliveryFailed(data);
          break;
      }
    }
    // Silently drop IN_TRANSIT, PENDING, etc.
  }

  private async createEvent(eventData: Partial<DeliveryEvent>): Promise<DeliveryEvent> {
    const event = this.deliveryEventRepository.create(eventData);
    return await this.deliveryEventRepository.save(event);
  }
}
