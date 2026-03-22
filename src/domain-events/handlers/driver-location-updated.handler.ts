import { Injectable } from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";

@Injectable()
export class DriverLocationUpdatedHandler {
  constructor(private readonly redisService: RedisService) {}

  async handle(payload: any): Promise<void> {
    if (payload.status !== "AVAILABLE") {
      return;
    }

    await this.redisService.updateDriverLocation(
      payload.driverId,
      payload.lat,
      payload.lon,
      60,
    );
  }
}
