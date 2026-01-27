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

    await this.redis.connect();
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
    // GEOSEARCH returns: [member, distance]
    const results = (await this.redis.call(
      "GEOSEARCH",
      this.GEO_KEY,
      "FROMLONLAT",
      lon,
      lat,
      "BYRADIUS",
      radiusKm,
      "km",
      "WITHDIST",
      "COUNT",
      limit,
    )) as [string, string][];

    if (!results || results.length === 0) {
      return [];
    }

    const output: {
      driverId: string;
      distanceKm: number;
    }[] = [];

    for (const [member, distance] of results) {
      const driverId = member.replace("driver:", "");

      const [status, online] = await Promise.all([
        this.redis.hget(this.STATUS_KEY, driverId),
        this.redis.exists(`${this.ONLINE_KEY_PREFIX}${driverId}`),
      ]);

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