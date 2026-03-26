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
} from "@nestjs/common";
import { Request } from "express";
import { DriversService } from "./drivers.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverLocationDto } from "./dto/update-driver-location.dto";
import { UpdateDriverStatusDto } from "./dto/update-driver-status.dto";
import { DriverStatsDto } from "./dto/driver-stats.dto";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";

@Controller("drivers")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

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

  @Get(":id")
  findOne(@Param("id", ParseUUIDPipe) id: string) {
    return this.driversService.findOne(id);
  }

  @Get(":id/stats")
  async getDriverStats(@Param("id", ParseUUIDPipe) id: string) {
    const stats = await this.driversService.getStats(id);
    if (!stats) {
      throw new NotFoundException(`Stats for driver ${id} not found`);
    }
    return stats;
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
}
