// src/drivers/drivers.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Query,
  BadRequestException,
  UseGuards,
  Req,
  ParseUUIDPipe,
  NotFoundException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { Request } from "express";
import { DriversService } from "./drivers.service";
import { DriverRegistrationService } from "./driver-registration.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverLocationDto } from "./dto/update-driver-location.dto";
import { UpdateDriverStatusDto } from "./dto/update-driver-status.dto";
import { UpdateDriverProfileDto } from "./dto/update-driver-profile.dto";
import {
  DriverEarningsQueryDto,
  EarningsPeriod,
} from "./dto/driver-earnings.dto";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";

@Controller({ path: "drivers", version: VERSION_NEUTRAL })
export class DriversController {
  constructor(
    private readonly driversService: DriversService,
    private readonly driverRegistrationService: DriverRegistrationService,
  ) {}

  /* -------------------- ADMIN -------------------- */

  @Post()
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.ADMIN_CREATE_DRIVER)
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  findAll() {
    return this.driversService.findAll();
  }

  @Patch(":id/activate")
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  activate(@Param("id", ParseUUIDPipe) id: string) {
    return this.driversService.setActive(id, true);
  }

  @Patch(":id/deactivate")
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  deactivate(@Param("id", ParseUUIDPipe) id: string) {
    return this.driversService.setActive(id, false);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.ADMIN_DELETE_DRIVER)
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.driversService.remove(id);
  }

  /* -------------------- DRIVER / SYSTEM -------------------- */

  @Get("available")
  @UseGuards(AuthGuard("jwt"))
  findAvailable(
    @Query("lat") lat?: string,
    @Query("lon") lon?: string,
    @Query("radiusKm") radiusKm?: string,
  ) {
    if ((lat && !lon) || (!lat && lon)) {
      throw new BadRequestException("lat and lon must be provided together");
    }

    return this.driversService.findAvailable(
      lat ? parseFloat(lat) : undefined,
      lon ? parseFloat(lon) : undefined,
      radiusKm ? parseFloat(radiusKm) : undefined,
    );
  }

  @Get("me")
  @UseGuards(AuthGuard("jwt"))
  getMe(@Req() req: Request & { user: any }) {
    return this.driversService.findById(req.user.driverId);
  }

  @Patch("me/profile")
  @UseGuards(AuthGuard("jwt"))
  async updateMyProfile(
    @Body() dto: UpdateDriverProfileDto,
    @Req() req: Request & { user: any },
  ) {
    return this.driverRegistrationService.completeProfile(req.user.driverId, {
      name: dto.name,
      phone: dto.phone,
      cityId: dto.cityId,
      vehicleType: dto.vehicleType,
      vehicleNumber: dto.vehicleNumber,
    });
  }

  @Get(":id")
  @UseGuards(AuthGuard("jwt"))
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.driversService.findOne(id);
  }

  @Get(":id/stats")
  @UseGuards(AuthGuard("jwt"))
  async getDriverStats(@Param("id", ParseUUIDPipe) id: string) {
    const stats = await this.driversService.getStats(id);
    return stats ?? { driverId: id, totalDeliveries: 0, completedDeliveries: 0, cancelledDeliveries: 0, reliabilityScore: 100 };
  }

  @Get(":id/score")
  @UseGuards(AuthGuard("jwt"))
  async getDriverScore(@Param("id", ParseUUIDPipe) id: string) {
    return await this.driversService.getDriverScore(id);
  }

  @Patch(":id/location")
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.DRIVER_UPDATE_OWN_LOCATION)
  updateLocation(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverLocationDto,
  ) {
    return this.driversService.updateLocation(id, dto.lat, dto.lon);
  }

  @Patch(":id/status")
  @UseGuards(AuthGuard("jwt"), PolicyGuard)
  @RequirePermissions(Permission.DRIVER_UPDATE_DELIVERY_STATUS)
  updateStatus(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateStatus(id, dto.status);
  }

  @Get("me/earnings")
  @UseGuards(AuthGuard("jwt"))
  @RequirePermissions(Permission.DRIVER_READ_OWN_EARNINGS)
  async getMyEarnings(
    @Req() req: Request & { user: any },
    @Query() query: DriverEarningsQueryDto,
  ) {
    return this.driversService.getDriverEarnings(
      req.user.driverId,
      query.period || EarningsPeriod.TODAY,
    );
  }
}
