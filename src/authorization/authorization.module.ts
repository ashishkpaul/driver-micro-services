import { Module } from '@nestjs/common';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { AuthorizationService } from './authorization.service';
import { DriverPolicy } from './driver.policy';
import { DeliveryPolicy } from './delivery.policy';
import { AssignmentPolicy } from './assignment.policy';

@Module({
  imports: [DeliveriesModule],
  providers: [AuthorizationService, DriverPolicy, DeliveryPolicy, AssignmentPolicy],
  exports: [AuthorizationService],
})
export class AuthorizationModule {}
