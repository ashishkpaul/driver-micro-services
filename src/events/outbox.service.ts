import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./outbox.entity";

@Injectable()
export class OutboxService {
  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
  ) {}

  async publish(
    manager: EntityManager,
    eventType: string,
    payload: any,
  ): Promise<void> {
    await manager.save(OutboxEvent, {
      eventType,
      payload,
      status: "PENDING",
      createdAt: new Date(),
    });
  }
}
