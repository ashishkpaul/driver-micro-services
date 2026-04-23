import {
  Controller,
  Get,
  Post,
  Body,
  ConflictException,
  VERSION_NEUTRAL,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { City } from "../entities/city.entity";
import { IsString, IsNotEmpty, IsOptional, IsNumber } from "class-validator";

class CreateCityDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  code!: string; // e.g. "KUK", "DEL"

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lon?: number;
}

@Controller({ path: "admin/cities", version: VERSION_NEUTRAL })
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class CityController {
  constructor(
    @InjectRepository(City)
    private readonly cityRepository: Repository<City>,
  ) {}

  /** GET /admin/cities — list all cities */
  @Get()
  @RequirePermissions(Permission.SUPER_ADMIN_MANAGE_CITIES)
  async listCities() {
    return this.cityRepository.find({ order: { name: "ASC" } });
  }

  /** POST /admin/cities — create a new city */
  @Post()
  @RequirePermissions(Permission.SUPER_ADMIN_MANAGE_CITIES)
  async createCity(@Body() dto: CreateCityDto) {
    const existing = await this.cityRepository.findOne({
      where: [{ name: dto.name }, { code: dto.code.toUpperCase() }],
    });
    if (existing) {
      throw new ConflictException(
        `City "${dto.name}" or code "${dto.code}" already exists`,
      );
    }

    const city = this.cityRepository.create({
      name: dto.name,
      code: dto.code.toUpperCase(),
      ...(dto.lat != null &&
        dto.lon != null && {
          center: `(${dto.lon},${dto.lat})` as any,
        }),
    });

    return this.cityRepository.save(city);
  }
}
