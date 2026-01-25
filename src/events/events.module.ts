import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { AssignmentModule } from "../assignment/assignment.module";

@Module({
  imports: [AssignmentModule],
  controllers: [EventsController],
})
export class EventsModule {}
