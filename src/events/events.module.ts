import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { AssignmentModule } from "../assignment/assignment.module";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [RedisModule, AssignmentModule],
  controllers: [EventsController],
  providers: [],
  exports: [],
})
export class EventsModule {}
