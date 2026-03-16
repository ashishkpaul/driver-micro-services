import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
} from "@nestjs/common";
import { DeliveriesService } from "./deliveries.service";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { VerifyDeliveryOtpDto } from "./dto/verify-delivery-otp.dto";

@Controller("deliveries")
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  create(@Body() createDeliveryDto: CreateDeliveryDto) {
    return this.deliveriesService.create(createDeliveryDto);
  }

  @Get()
  findAll() {
    return this.deliveriesService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.deliveriesService.findOne(id);
  }

  @Get("seller-order/:sellerOrderId")
  findBySellerOrderId(@Param("sellerOrderId") sellerOrderId: string) {
    return this.deliveriesService.findBySellerOrderId(sellerOrderId);
  }

  @Get("seller-order/:sellerOrderId/history")
  getDeliveryHistory(@Param("sellerOrderId") sellerOrderId: string) {
    return this.deliveriesService.getDeliveryHistory(sellerOrderId);
  }

  @Get("drivers/:driverId/active")
  findActiveForDriver(@Param("driverId") driverId: string) {
    return this.deliveriesService.findActiveForDriver(driverId);
  }

  @Patch(":id/assign")
  assignDriver(
    @Param("id") id: string,
    @Body() body: { driverId: string; assignmentId: string },
  ) {
    return this.deliveriesService.assignDriver(
      id,
      body.driverId,
      body.assignmentId,
    );
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() updateDeliveryStatusDto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveriesService.updateStatus(id, updateDeliveryStatusDto);
  }

  @Post(":id/otp/regenerate")
  regenerateOtp(@Param("id", ParseUUIDPipe) id: string) {
    return this.deliveriesService.generateDeliveryOtp(id);
  }

  @Post(":id/otp/verify")
  verifyOtp(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() verifyDeliveryOtpDto: VerifyDeliveryOtpDto,
  ) {
    return this.deliveriesService.verifyDeliveryOtp(
      id,
      verifyDeliveryOtpDto.otp,
      verifyDeliveryOtpDto.proofUrl,
    );
  }
}
