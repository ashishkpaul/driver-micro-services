import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

import { DriverOffer } from './entities/driver-offer.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { Assignment } from '../assignment/entities/assignment.entity';
import { DriverStatus } from '../drivers/enums/driver-status.enum';

import { CreateOfferDto } from './dto/create-offer.dto';
import { AcceptOfferDto } from './dto/accept-offer.dto';
import { RejectOfferDto } from './dto/reject-offer.dto';

@Injectable()
export class OffersService {
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
    private readonly dataSource: DataSource
  ) {}

  async createOfferForDriver(
    createOfferDto: CreateOfferDto
  ): Promise<{
    success: boolean;
    offerId: string;
    expiresAt: string;
    payload: any;
  }> {
    const { driverId, deliveryId, expiresInSeconds = 30 } = createOfferDto;

    // Validate driver exists and is available
    const driver = await this.driverRepository.findOne({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException(`Driver ${driverId} not found`);
    }

    if (driver.status !== 'AVAILABLE') {
      throw new ConflictException(`Driver ${driverId} is not available`);
    }

    // Validate delivery exists and is ready
    const delivery = await this.deliveryRepository.findOne({ where: { id: deliveryId } });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    if (delivery.status !== 'PENDING') {
      throw new ConflictException(`Delivery ${deliveryId} is not ready for assignment`);
    }

    // Calculate offer payload
    const offerPayload = await this.calculateOfferPayload(delivery, driver);

    // Create offer
    const offer = this.driverOfferRepository.create({
      deliveryId,
      driverId,
      status: 'PENDING',
      offerPayload,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000)
    });

    const savedOffer = await this.driverOfferRepository.save(offer);

    // Set Redis keys for V2 intent - fast lookup and invalidation
    const redisClient = this.redisService.getClient();
    const pipeline = redisClient.pipeline();
    
    // Individual offer lookup
    pipeline.setex(`offer:${savedOffer.id}`, expiresInSeconds, JSON.stringify({ driverId, deliveryId }));
    
    // Delivery-to-offers mapping
    pipeline.zadd(`delivery:${deliveryId}:offers`, Date.now() + expiresInSeconds * 1000, savedOffer.id);
    
    // Driver-to-offers mapping
    pipeline.sadd(`driver:${driverId}:offers`, savedOffer.id);
    pipeline.expire(`driver:${driverId}:offers`, expiresInSeconds);
    
    await pipeline.exec();

    return {
      success: true,
      offerId: savedOffer.id,
      expiresAt: savedOffer.expiresAt ? savedOffer.expiresAt.toISOString() : '',
      payload: offerPayload
    };
  }

  async acceptOffer(
    acceptOfferDto: AcceptOfferDto
  ): Promise<{
    success: boolean;
    assignmentId: string;
    deliveryId: string;
    driverId: string;
    responseTimeMs: number;
  }> {
    const { offerId, driverId, acceptedAt: acceptedAtStr } = acceptOfferDto;
    const acceptedAt = new Date(acceptedAtStr);

    return this.dataSource.transaction(async manager => {
      // Lock offer row for update to prevent race conditions
      const offer = await manager.findOne(DriverOffer, { 
        where: { id: offerId },
        lock: { mode: 'pessimistic_write' }
      });
      
      if (!offer) {
        throw new NotFoundException('Offer not found');
      }

      if (offer.driverId !== driverId) {
        throw new BadRequestException('Invalid driver for this offer');
      }

      if (offer.status !== 'PENDING') {
        throw new ConflictException('Offer already processed');
      }

      if (offer.expiresAt < new Date()) {
        throw new ConflictException('Offer has expired');
      }

      // Calculate response time
      const responseTimeMs = acceptedAt.getTime() - offer.createdAt.getTime();

      // Update offer status
      offer.status = 'ACCEPTED';
      offer.acceptedAt = acceptedAt;
      offer.driverResponseTimeMs = responseTimeMs;
      await manager.save(offer);

      // Create assignment
      const assignment = this.assignmentRepository.create({
        sellerOrderId: offer.deliveryId, // Note: In V2, deliveryId maps to sellerOrderId
        driverId
      });
      const savedAssignment = await manager.save(assignment);

      // Mark driver as BUSY
      await manager.update(Driver, driverId, { status: DriverStatus.BUSY });

      return {
        success: true,
        assignmentId: savedAssignment.id,
        deliveryId: offer.deliveryId,
        driverId,
        responseTimeMs
      };
    });
  }

  async rejectOffer(
    rejectOfferDto: RejectOfferDto
  ): Promise<{
    success: boolean;
    nextOfferId?: string;
    reason: string;
  }> {
    const { offerId, driverId, reason } = rejectOfferDto;

    // Find and validate offer
    const offer = await this.driverOfferRepository.findOne({ where: { id: offerId } });
    if (!offer) {
      throw new NotFoundException('Offer not found');
    }

    if (offer.driverId !== driverId) {
      throw new BadRequestException('Invalid driver for this offer');
    }

    if (offer.status !== 'PENDING') {
      throw new ConflictException('Offer already processed');
    }

    // Update offer status
    offer.status = 'REJECTED';
    offer.rejectedAt = new Date();
    if (reason) {
      offer.rejectionReason = reason;
    }
    await this.driverOfferRepository.save(offer);

    return {
      success: true,
      reason: reason || 'other'
    };
  }

  async getDriverOffers(driverId: string): Promise<DriverOffer[]> {
    return this.driverOfferRepository.find({
      where: { driverId },
      order: { createdAt: 'DESC' }
    });
  }

  async getDeliveryOffers(deliveryId: string): Promise<DriverOffer[]> {
    return this.driverOfferRepository.find({
      where: { deliveryId },
      order: { createdAt: 'DESC' }
    });
  }

  async expireOffers(): Promise<void> {
    const expiredOffers = await this.driverOfferRepository.find({
      where: {
        status: 'PENDING',
        expiresAt: LessThan(new Date())
      }
    });

    for (const offer of expiredOffers) {
      offer.status = 'EXPIRED';
      await this.driverOfferRepository.save(offer);
    }
  }

  private async calculateOfferPayload(
    delivery: Delivery,
    driver: Driver
  ): Promise<any> {
    // Simplified offer payload calculation
    const estimatedPickupTimeMin = 10; // Simplified
    const estimatedEarning = 100; // Simplified

    return {
      pickupLocation: {
        lat: delivery.pickupLat,
        lon: delivery.pickupLon
      },
      pickupStoreName: 'Store Name', // Simplified
      estimatedPickupTimeMin,
      estimatedDeliveryTime: new Date(Date.now() + (estimatedPickupTimeMin + 10) * 60000).toISOString(),
      estimatedDistanceKm: 5, // Simplified
      estimatedEarning
    };
  }

  private async triggerNextCandidate(deliveryId: string): Promise<string | undefined> {
    // Simplified - in real implementation, this would find the next available driver
    // and create a new offer
    return undefined;
  }
}