import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import Redis from "ioredis";

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private redis!: Redis;

  // Redis keys
  private readonly GEO_KEY = "drivers:geo";
  private readonly STATUS_KEY = "drivers:status";
  private readonly ONLINE_KEY_PREFIX = "driver:online:";

  async onModuleInit() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      maxRetriesPerRequest: null, // Prevent request-level failures under transient Redis hiccups
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.redis.on("connect", () => {
      this.logger.log("Redis connected");
    });

    this.redis.on("error", (err) => {
      this.logger.error("Redis error", err);
    });

    try {
      await this.redis.connect();
    } catch (err) {
      this.logger.error("Redis unavailable at startup, continuing in degraded mode", err);
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  // ------------------------------------------------------------------
  // DRIVER AVAILABILITY OPERATIONS
  // ------------------------------------------------------------------

  /**
   * Update driver location & mark AVAILABLE
   */
  async updateDriverLocation(
    driverId: string,
    lat: number,
    lon: number,
    ttlSeconds = 60,
  ): Promise<void> {
    const member = `driver:${driverId}`;

    const pipeline = this.redis.pipeline();
    pipeline.geoadd(this.GEO_KEY, lon, lat, member);
    pipeline.hset(this.STATUS_KEY, driverId, "AVAILABLE");
    pipeline.set(
      `${this.ONLINE_KEY_PREFIX}${driverId}`,
      "1",
      "EX",
      ttlSeconds,
    );

    await pipeline.exec();
  }

  /**
   * Mark driver BUSY (assigned to delivery)
   */
  async markDriverBusy(driverId: string): Promise<void> {
    const member = `driver:${driverId}`;

    const pipeline = this.redis.pipeline();
    pipeline.zrem(this.GEO_KEY, member);
    pipeline.hset(this.STATUS_KEY, driverId, "BUSY");
    pipeline.del(`${this.ONLINE_KEY_PREFIX}${driverId}`);

    await pipeline.exec();
  }

  /**
   * Mark driver OFFLINE
   */
  async markDriverOffline(driverId: string): Promise<void> {
    const member = `driver:${driverId}`;

    const pipeline = this.redis.pipeline();
    pipeline.zrem(this.GEO_KEY, member);
    pipeline.hset(this.STATUS_KEY, driverId, "OFFLINE");
    pipeline.del(`${this.ONLINE_KEY_PREFIX}${driverId}`);

    await pipeline.exec();
  }

  /**
   * Find available drivers near a location
   */
  async findAvailableDrivers(
    lat: number,
    lon: number,
    radiusKm = 5,
    limit = 50,
  ): Promise<
    {
      driverId: string;
      distanceKm: number;
    }[]
  > {
    // Cap radius for safety
    const safeRadiusKm = Math.min(radiusKm, 100);
    
    // GEOSEARCH returns: [member, distance]
    const results = (await this.redis.call(
      "GEOSEARCH",
      this.GEO_KEY,
      "FROMLONLAT",
      lon,
      lat,
      "BYRADIUS",
      safeRadiusKm,
      "km",
      "WITHDIST",
      "COUNT",
      limit,
    )) as [string, string][];

    if (!results || results.length === 0) {
      return [];
    }

    // Use pipeline for batch operations
    const pipeline = this.redis.pipeline();
    
    for (const [member] of results) {
      const driverId = member.replace("driver:", "");
      pipeline.hget(this.STATUS_KEY, driverId);
      pipeline.exists(`${this.ONLINE_KEY_PREFIX}${driverId}`);
    }

    const responses = await pipeline.exec();
    const output: {
      driverId: string;
      distanceKm: number;
    }[] = [];

    // Process responses in pairs (status, online)
    for (let i = 0; i < results.length; i++) {
      const [member, distance] = results[i];
      const driverId = member.replace("driver:", "");
      
      // Each driver has 2 operations in pipeline: hget (index 2*i) and exists (index 2*i+1)
      const statusResponse = responses![2 * i];
      const onlineResponse = responses![2 * i + 1];
      
      // Check if pipeline commands succeeded
      if (statusResponse[0] || onlineResponse[0]) {
        // Pipeline error - skip this driver
        continue;
      }
      
      const status = statusResponse[1];
      const online = onlineResponse[1];
      
      if (status === "AVAILABLE" && online === 1) {
        output.push({
          driverId,
          distanceKm: Number(distance),
        });
      }
    }

    return output;
  }

  /**
   * Health check helper
   */
  async ping(): Promise<boolean> {
    try {
      const res = await this.redis.ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }
}