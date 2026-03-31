// src/controllers/zone.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  NotFoundException,
  BadRequestException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { AdminRole } from "../entities/admin-user.entity";
import { Request } from "express";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Zone } from "../entities/zone.entity";
import { City } from "../entities/city.entity";

@Controller({ path: "admin/zones", version: VERSION_NEUTRAL })
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class ZoneController {
  constructor(
    @InjectRepository(Zone)
    private readonly zoneRepository: Repository<Zone>,
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  /**
   * GET /admin/zones
   *
   * List all zones with optional city filter
   */
  @Get()
  @RequirePermissions(Permission.ADMIN_READ_ZONE_ANY)
  async listZones(
    @Req() request: Request & { user: any },
    @Query("cityId") cityId?: string,
  ) {
    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    const where: any = {};
    if (filterCityId) {
      where.cityId = filterCityId;
    }

    const zones = await this.zoneRepository.find({
      where,
      relations: ["city"],
      order: { name: "ASC" },
    });

    return zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      code: zone.code,
      cityId: zone.cityId,
      cityName: zone.city?.name,
      boundary: zone.boundary,
      createdAt: zone.createdAt,
      updatedAt: zone.updatedAt,
    }));
  }

  /**
   * POST /admin/zones
   *
   * Create a new zone
   */
  @Post()
  @RequirePermissions(Permission.SUPER_ADMIN_MANAGE_ZONES)
  async createZone(
    @Body()
    body: { name: string; code: string; cityId: string; boundary?: string },
    @Req() request: Request & { user: any },
  ) {
    // Verify city exists
    const city = await this.cityRepository.findOne({
      where: { id: body.cityId },
    });
    if (!city) {
      throw new NotFoundException("City not found");
    }

    // Check if zone with same name exists in this city
    const existingZoneByName = await this.zoneRepository.findOne({
      where: { name: body.name, cityId: body.cityId },
    });
    if (existingZoneByName) {
      throw new BadRequestException(
        "Zone with this name already exists in this city",
      );
    }

    // Check if zone with same code exists
    const existingZoneByCode = await this.zoneRepository.findOne({
      where: { code: body.code },
    });
    if (existingZoneByCode) {
      throw new BadRequestException("Zone with this code already exists");
    }

    const zone = this.zoneRepository.create({
      name: body.name,
      code: body.code,
      cityId: body.cityId,
      boundary: body.boundary,
    });

    const savedZone = await this.zoneRepository.save(zone);

    return {
      id: savedZone.id,
      name: savedZone.name,
      code: savedZone.code,
      cityId: savedZone.cityId,
      cityName: city.name,
      boundary: savedZone.boundary,
      createdAt: savedZone.createdAt,
      updatedAt: savedZone.updatedAt,
    };
  }

  /**
   * PATCH /admin/zones/:id
   *
   * Update a zone
   */
  @Patch(":id")
  @RequirePermissions(Permission.ADMIN_UPDATE_ZONE_CONFIG)
  async updateZone(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() body: { name?: string; code?: string; boundary?: string },
    @Req() request: Request & { user: any },
  ) {
    const zone = await this.zoneRepository.findOne({
      where: { id },
      relations: ["city"],
    });

    if (!zone) {
      throw new NotFoundException("Zone not found");
    }

    // If updating name, check for duplicates
    if (body.name && body.name !== zone.name) {
      const existingZone = await this.zoneRepository.findOne({
        where: { name: body.name, cityId: zone.cityId },
      });
      if (existingZone) {
        throw new BadRequestException(
          "Zone with this name already exists in this city",
        );
      }
      zone.name = body.name;
    }

    // If updating code, check for duplicates
    if (body.code && body.code !== zone.code) {
      const existingZone = await this.zoneRepository.findOne({
        where: { code: body.code },
      });
      if (existingZone) {
        throw new BadRequestException("Zone with this code already exists");
      }
      zone.code = body.code;
    }

    if (body.boundary !== undefined) {
      zone.boundary = body.boundary;
    }

    const updatedZone = await this.zoneRepository.save(zone);

    return {
      id: updatedZone.id,
      name: updatedZone.name,
      code: updatedZone.code,
      cityId: updatedZone.cityId,
      cityName: updatedZone.city?.name,
      boundary: updatedZone.boundary,
      createdAt: updatedZone.createdAt,
      updatedAt: updatedZone.updatedAt,
    };
  }

  /**
   * DELETE /admin/zones/:id
   *
   * Delete a zone (hard delete - use with caution)
   */
  @Delete(":id")
  @RequirePermissions(Permission.SUPER_ADMIN_MANAGE_ZONES)
  async deleteZone(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    const zone = await this.zoneRepository.findOne({
      where: { id },
    });

    if (!zone) {
      throw new NotFoundException("Zone not found");
    }

    await this.zoneRepository.remove(zone);

    return { message: "Zone deleted successfully" };
  }

  /**
   * GET /admin/zones/:id/drivers
   *
   * Get drivers in a specific zone
   */
  @Get(":id/drivers")
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async getZoneDrivers(
    @Param("id", ParseUUIDPipe) zoneId: string,
    @Req() request: Request & { user: any },
    @Query("skip") skip?: string,
    @Query("take") take?: string,
  ) {
    const zone = await this.zoneRepository.findOne({
      where: { id: zoneId },
    });

    if (!zone) {
      throw new NotFoundException("Zone not found");
    }

    // This would require a Driver repository - for now return placeholder
    // In a full implementation, you'd inject DriverRepository and query drivers by zoneId
    return {
      zoneId,
      zoneName: zone.name,
      drivers: [],
      total: 0,
      skip: parseInt(skip || "0") || 0,
      take: parseInt(take || "20") || 20,
      message: "Driver listing requires DriverRepository integration",
    };
  }
}
