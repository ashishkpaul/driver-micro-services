import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverStats } from './driver-stats.entity';
import { DriverStatsService } from './driver-stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([DriverStats])],
  providers: [DriverStatsService],
  exports: [DriverStatsService],
})
export class DriverStatsModule {}