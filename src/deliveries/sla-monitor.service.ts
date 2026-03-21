import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, LessThan, Repository } from "typeorm";
import { Delivery, DeliveryStatus } from "./entities/delivery.entity";
import { RedisService } from "../redis/redis.service";
import { AlertingService } from "../services/alerting.service";

@Injectable()
export class SlaMonitorService {
  private readonly logger = new Logger(SlaMonitorService.name);
  private readonly lockKey = "sla-checker:lock";

  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
    private readonly redisService: RedisService,
    private readonly alertingService: AlertingService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async checkSlaBreaches(): Promise<void> {
    const acquired = await this.redisService
      .getClient()
      .set(this.lockKey, "1", "EX", 55, "NX");

    if (!acquired) {
      return;
    }

    try {
      const now = new Date();

      const pickupBreaches = await this.deliveryRepository.find({
        where: {
          status: DeliveryStatus.ASSIGNED,
          expectedPickupAt: LessThan(now),
          slaBreachAt: IsNull(),
        },
      });

      const deliveryBreaches = await this.deliveryRepository.find({
        where: {
          status: In([DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT]),
          expectedDeliveryAt: LessThan(now),
          slaBreachAt: IsNull(),
        },
      });

      const uniqueBreaches = new Map<string, Delivery>();
      for (const breach of [...pickupBreaches, ...deliveryBreaches]) {
        uniqueBreaches.set(breach.id, breach);
      }

      if (uniqueBreaches.size === 0) {
        return;
      }

      for (const delivery of uniqueBreaches.values()) {
        delivery.slaBreachAt = now;
      }

      await this.deliveryRepository.save([...uniqueBreaches.values()]);
      this.logger.warn(`Marked ${uniqueBreaches.size} delivery SLA breaches`);
      
      // Task 5: Hook Dead-Letter & SLA Breaches to External Alerts
      if (uniqueBreaches.size > 0) {
        await this.alertingService.sendSlaBreachAlert(uniqueBreaches.size);
      }
    } finally {
      await this.redisService.getClient().del(this.lockKey);
    }
  }
}
