import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Assignment } from "./entities/assignment.entity";
import { AssignmentService } from "./assignment.service";
import { DriversModule } from "../drivers/drivers.module";
import { DeliveriesModule } from "../deliveries/deliveries.module";
import { WebhooksModule } from "../webhooks/webhooks.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment]),
    DriversModule,
    DeliveriesModule,
    WebhooksModule,
  ],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
