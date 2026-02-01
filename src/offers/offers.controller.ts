import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { AcceptOfferDto } from './dto/accept-offer.dto';
import { RejectOfferDto } from './dto/reject-offer.dto';

@Controller('offers')
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  async createOffer(@Body() createOfferDto: CreateOfferDto) {
    return this.offersService.createOfferForDriver(createOfferDto);
  }

  @Patch(':offerId/accept')
  async acceptOffer(@Param('offerId') offerId: string, @Body() acceptOfferDto: AcceptOfferDto) {
    return this.offersService.acceptOffer(acceptOfferDto);
  }

  @Patch(':offerId/reject')
  async rejectOffer(@Param('offerId') offerId: string, @Body() rejectOfferDto: RejectOfferDto) {
    return this.offersService.rejectOffer(rejectOfferDto);
  }

  @Get('driver/:driverId')
  async getDriverOffers(@Param('driverId') driverId: string) {
    return this.offersService.getDriverOffers(driverId);
  }

  @Get('delivery/:deliveryId')
  async getDeliveryOffers(@Param('deliveryId') deliveryId: string) {
    return this.offersService.getDeliveryOffers(deliveryId);
  }
}