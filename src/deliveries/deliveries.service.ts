import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    @InjectRepository(Delivery)
    private deliveryRepository: Repository<Delivery>,
    @InjectRepository(DeliveryEvent)
    private deliveryEventRepository: Repository<DeliveryEvent>,
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

  async assignDriver(deliveryId: string, driverId: string): Promise<Delivery> {
    const delivery = await this.findOne(deliveryId);
    
    delivery.driverId = driverId;
    delivery.status = 'ASSIGNED';
    delivery.assignedAt = new Date();
    
    await this.createEvent({
      deliveryId: delivery.id,
      sellerOrderId: delivery.sellerOrderId,
      eventType: 'ASSIGNED',
      metadata: { driverId },
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
        break;
      case 'DELIVERED':
        delivery.deliveredAt = new Date();
        delivery.deliveryProofUrl = updateDto.proofUrl;
        break;
      case 'FAILED':
        delivery.failedAt = new Date();
        delivery.failureCode = updateDto.failureCode;
        delivery.failureReason = updateDto.failureReason;
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

  private async createEvent(eventData: Partial<DeliveryEvent>): Promise<DeliveryEvent> {
    const event = this.deliveryEventRepository.create(eventData);
    return await this.deliveryEventRepository.save(event);
  }
}
