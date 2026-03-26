import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SafeDispatchService } from "./safe-dispatch.service";
import { DispatchDecision } from "./entities/dispatch-decision.entity";
import { DispatchScoringModule } from "../dispatch-scoring/dispatch-scoring.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchDecision]),
    DispatchScoringModule,
  ],
  providers: [SafeDispatchService],
  exports: [SafeDispatchService],
})
export class SafeDispatchModule {}