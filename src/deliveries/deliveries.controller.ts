import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  ParseUUIDPipe,
  UseInterceptors,
  UseGuards,
  Req,
  ForbiddenException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { DeliveriesService } from "./deliveries.service";
import { CreateDeliveryDto } from "./dto/create-delivery.dto";
import { UpdateDeliveryStatusDto } from "./dto/update-delivery-status.dto";
import { VerifyDeliveryOtpDto } from "./dto/verify-delivery-otp.dto";
import { IdempotencyInterceptor } from "../common/interceptors/idempotency.interceptor";
import {
  ApiTags,
  ApiOkResponse,
  getSchemaPath,
  ApiExtraModels,
} from "@nestjs/swagger";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import { Delivery } from "./entities/delivery.entity";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard } from "../auth/policy.guard";
import { Request } from "express";

@Controller({ path: "deliveries", version: VERSION_NEUTRAL })
@ApiTags("Deliveries")
@ApiExtraModels(ApiResponseDto, Delivery)
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(Delivery) },
          },
        },
      ],
    },
  })
  create(@Body() createDeliveryDto: CreateDeliveryDto) {
    return this.deliveriesService.create(createDeliveryDto);
  }

  @Get()
  findAll() {
    return this.deliveriesService.findAll();
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
  async findActiveForDriver(
    @Param("driverId") driverId: string,
    @Req() request: Request & { user: any },
  ) {
    // Ownership check: drivers can only query their own active delivery
    if (request.user.type === "driver" && request.user.driverId !== driverId) {
      throw new ForbiddenException(
        "You can only query your own active delivery",
      );
    }

    const delivery = await this.deliveriesService.findActiveForDriver(driverId);
    return {
      delivery: delivery || null,
    };
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.deliveriesService.findOne(id);
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
  async verifyOtp(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() verifyDeliveryOtpDto: VerifyDeliveryOtpDto,
    @Req() request: Request & { user: any },
  ) {
    // Ownership check: drivers can only verify OTP for their own active/assigned delivery
    if (request.user.type === "driver") {
      const delivery = await this.deliveriesService.findOne(id);
      if (delivery.driverId !== request.user.driverId) {
        throw new ForbiddenException(
          "You can only verify OTP for your own assigned delivery",
        );
      }
    }

    return this.deliveriesService.verifyOtp(
      id,
      verifyDeliveryOtpDto.otp,
      verifyDeliveryOtpDto.proofUrl,
      verifyDeliveryOtpDto.driverLat,
      verifyDeliveryOtpDto.driverLon,
    );
  }
}
