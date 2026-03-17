import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Assignment } from "./entities/assignment.entity";
import { AssignmentService } from "./assignment.service";
import { DriversModule } from "../drivers/drivers.module";
import { DeliveriesModule } from "../deliveries/deliveries.module";
import { AssignmentAuthorizationService } from "./assignment.authorization.service";
import { DomainEventsModule } from "../domain-events/domain-events.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment]),
    DriversModule,
    DeliveriesModule,
    DomainEventsModule,
  ],
  providers: [AssignmentService, AssignmentAuthorizationService],
  exports: [AssignmentService, AssignmentAuthorizationService],
})
export class AssignmentModule {}
