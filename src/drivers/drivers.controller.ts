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
} from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverLocationDto } from './dto/update-driver-location.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { AdminScopeGuard } from '../auth/admin-scope.guard';
import { AuthGuard } from '@nestjs/passport';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  /* -------------------- ADMIN -------------------- */

  @Post()
  @UseGuards(AuthGuard('jwt'), AdminScopeGuard)
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get()
  @UseGuards(AuthGuard('jwt'), AdminScopeGuard)
  findAll() {
    return this.driversService.findAll();
  }

  @Patch(':id/activate')
  @UseGuards(AuthGuard('jwt'), AdminScopeGuard)
  activate(@Param('id') id: string) {
    return this.driversService.setActive(id, true);
  }

  @Patch(':id/deactivate')
  @UseGuards(AuthGuard('jwt'), AdminScopeGuard)
  deactivate(@Param('id') id: string) {
    return this.driversService.setActive(id, false);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AuthGuard('jwt'), AdminScopeGuard)
  remove(@Param('id') id: string) {
    return this.driversService.remove(id);
  }

  /* -------------------- DRIVER / SYSTEM -------------------- */

  @Get('available')
  @UseGuards(AuthGuard('jwt'))
  findAvailable(
    @Query('lat') lat?: string,
    @Query('lon') lon?: string,
    @Query('radiusKm') radiusKm?: string,
  ) {
    if ((lat && !lon) || (!lat && lon)) {
      throw new BadRequestException('lat and lon must be provided together');
    }

    return this.driversService.findAvailable(
      lat ? parseFloat(lat) : undefined,
      lon ? parseFloat(lon) : undefined,
      radiusKm ? parseFloat(radiusKm) : undefined,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @Body() dto: UpdateDriverLocationDto,
  ) {
    return this.driversService.updateLocation(id, dto.lat, dto.lon);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateStatus(id, dto.status);
  }
}
