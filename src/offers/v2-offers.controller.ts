import { Controller, Post, Body, Get, Param, Patch } from '@nestjs/common';
import { OffersService } from './offers.service';
import { CreateOfferDto } from './dto/create-offer.dto';
import { AcceptOfferDto } from './dto/accept-offer.dto';
import { RejectOfferDto } from './dto/reject-offer.dto';

@Controller('v2')
export class V2OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post('deliveries/:deliveryId/offers')
  async createOffer(
    @Param('deliveryId') deliveryId: string,
    @Body() createOfferDto: CreateOfferDto
  ) {
    // Override deliveryId from path parameter
    return this.offersService.createOfferForDriver({
      ...createOfferDto,
      deliveryId
    });
  }

  @Post('drivers/:driverId/offers/:offerId/accept')
  async acceptOffer(
    @Param('driverId') driverId: string,
    @Param('offerId') offerId: string,
    @Body() acceptOfferDto: AcceptOfferDto
  ) {
    // Override driverId from path parameter
    return this.offersService.acceptOffer({
      ...acceptOfferDto,
      offerId,
      driverId
    });
  }

  @Patch('drivers/:driverId/offers/:offerId/reject')
  async rejectOffer(
    @Param('driverId') driverId: string,
    @Param('offerId') offerId: string,
    @Body() rejectOfferDto: RejectOfferDto
  ) {
    // Override driverId and offerId from path parameters
    return this.offersService.rejectOffer({
      ...rejectOfferDto,
      offerId,
      driverId
    });
  }

  @Get('drivers/:driverId/offers')
  async getDriverOffers(@Param('driverId') driverId: string) {
    return this.offersService.getDriverOffers(driverId);
  }

  @Get('deliveries/:deliveryId/offers')
  async getDeliveryOffers(@Param('deliveryId') deliveryId: string) {
    return this.offersService.getDeliveryOffers(deliveryId);
  }
}