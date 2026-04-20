import { Controller, Post, Body, Get, Param, Patch, VERSION_NEUTRAL } from "@nestjs/common";
import {
  ApiTags,
  ApiOkResponse,
  ApiExtraModels,
  getSchemaPath,
} from "@nestjs/swagger";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import { OffersService } from "./offers.service";
import { CreateOfferDto } from "./dto/create-offer.dto";
import { AcceptOfferDto } from "./dto/accept-offer.dto";
import { RejectOfferDto } from "./dto/reject-offer.dto";
import { DriverOffer } from "./entities/driver-offer.entity";

@ApiTags("Offers")
@ApiExtraModels(ApiResponseDto, DriverOffer)
@Controller({ path: "offers", version: VERSION_NEUTRAL })
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Post()
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(DriverOffer) },
          },
        },
      ],
    },
  })
  async createOffer(@Body() createOfferDto: CreateOfferDto) {
    return this.offersService.createOfferForDriver(createOfferDto);
  }

  @Patch(":offerId/accept")
  async acceptOffer(
    @Param("offerId") offerId: string,
    @Body() acceptOfferDto: AcceptOfferDto,
  ) {
    return this.offersService.acceptOffer(acceptOfferDto);
  }

  @Patch(":offerId/reject")
  async rejectOffer(
    @Param("offerId") offerId: string,
    @Body() rejectOfferDto: RejectOfferDto,
  ) {
    return this.offersService.rejectOffer(rejectOfferDto);
  }

  @Get("driver/:driverId")
  async getDriverOffers(@Param("driverId") driverId: string) {
    return this.offersService.getDriverOffers(driverId);
  }

  @Get("delivery/:deliveryId")
  async getDeliveryOffers(@Param("deliveryId") deliveryId: string) {
    return this.offersService.getDeliveryOffers(deliveryId);
  }
}
