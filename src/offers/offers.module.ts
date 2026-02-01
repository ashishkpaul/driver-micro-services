import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisModule } from '../redis/redis.module';

// Controllers
import { OffersController } from './offers.controller';
import { V2OffersController } from './v2-offers.controller';

// Services
import { OffersService } from './offers.service';

// Entities
import { DriverOffer } from './entities/driver-offer.entity';
import { Driver } from '../drivers/entities/driver.entity';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { Assignment } from '../assignment/entities/assignment.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverOffer,
      Driver,
      Delivery,
      Assignment
    ]),
    RedisModule
  ],
  controllers: [OffersController, V2OffersController],
  providers: [OffersService],
  exports: [OffersService]
})
export class OffersModule {}
