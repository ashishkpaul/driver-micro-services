import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class WebSocketMetricsService {
  constructor(private readonly redis: RedisService) {}

  private driverKey(driverId: string) {
    return `ws:driver:${driverId}`;
  }

  private getClient() {
    return this.redis.getClient();
  }

  async onConnect(driverId: string) {
    // Use Redis pipeline for atomic operations
    const pipeline = this.getClient().pipeline();
    pipeline.hincrby(this.driverKey(driverId), 'connects', 1);
    pipeline.hset(this.driverKey(driverId), 'lastSeenAt', Date.now());
    // Set TTL of 24 hours to avoid Redis bloat
    pipeline.expire(this.driverKey(driverId), 60 * 60 * 24);
    pipeline.incr('ws:connections:active');
    await pipeline.exec();
  }

  async onDisconnect(driverId: string) {
    const pipeline = this.getClient().pipeline();
    pipeline.hincrby(this.driverKey(driverId), 'disconnects', 1);
    pipeline.decr('ws:connections:active');
    await pipeline.exec();
  }

  async recordLatency(driverId: string, latencyMs: number) {
    const pipeline = this.getClient().pipeline();
    pipeline.hset(this.driverKey(driverId), 'lastLatencyMs', latencyMs);
    pipeline.zadd('ws:latency', Date.now(), latencyMs);
    await pipeline.exec();
  }

  async messageSent(driverId: string) {
    await this.getClient().hincrby(this.driverKey(driverId), 'sent', 1);
  }

  async messageReceived(driverId: string) {
    await this.getClient().hincrby(this.driverKey(driverId), 'received', 1);
  }
}
