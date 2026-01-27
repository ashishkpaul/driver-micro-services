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
} from "@nestjs/common";
import { DriversService } from "./drivers.service";
import { CreateDriverDto } from "./dto/create-driver.dto";
import { UpdateDriverLocationDto } from "./dto/update-driver-location.dto";
import { UpdateDriverStatusDto } from "./dto/update-driver-status.dto";

@Controller("drivers")
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  create(@Body() createDriverDto: CreateDriverDto) {
    return this.driversService.create(createDriverDto);
  }

  @Get()
  findAll() {
    return this.driversService.findAll();
  }

  @Get("available")
  findAvailable(
    @Query("lat") lat?: string,
    @Query("lon") lon?: string,
    @Query("radiusKm") radiusKm?: string,
  ) {
    // Validate that lat and lon are provided together
    if ((lat && !lon) || (!lat && lon)) {
      throw new BadRequestException("lat and lon must be provided together");
    }

    const latNum = lat ? parseFloat(lat) : undefined;
    const lonNum = lon ? parseFloat(lon) : undefined;
    const radiusKmNum = radiusKm ? parseFloat(radiusKm) : undefined;
    return this.driversService.findAvailable(latNum, lonNum, radiusKmNum);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.driversService.findOne(id);
  }

  @Patch(":id/location")
  updateLocation(
    @Param("id") id: string,
    @Body() updateDriverLocationDto: UpdateDriverLocationDto,
  ) {
    return this.driversService.updateLocation(
      id,
      updateDriverLocationDto.lat,
      updateDriverLocationDto.lon,
    );
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() updateDriverStatusDto: UpdateDriverStatusDto,
  ) {
    return this.driversService.updateStatus(id, updateDriverStatusDto.status);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.driversService.remove(id);
  }
}
