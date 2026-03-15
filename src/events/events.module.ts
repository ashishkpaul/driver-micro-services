import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { AssignmentModule } from "../assignment/assignment.module";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [AssignmentModule, RedisModule],
  controllers: [EventsController],
})
export class EventsModule {}
