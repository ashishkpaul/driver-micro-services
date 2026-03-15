import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Assignment } from "./entities/assignment.entity";
import { AssignmentService } from "./assignment.service";
import { DriversModule } from "../drivers/drivers.module";
import { DeliveriesModule } from "../deliveries/deliveries.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment]),
    DriversModule,
    DeliveriesModule,
  ],
  providers: [AssignmentService],
  exports: [AssignmentService],
})
export class AssignmentModule {}
