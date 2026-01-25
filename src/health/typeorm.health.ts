import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TypeOrmHealthIndicator {
  constructor(@InjectDataSource() private connection: DataSource) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // TypeORM-safe health check
      await this.connection.manager.query('SELECT 1');
      return {
        [key]: {
          status: 'up',
        },
      };
    } catch (error) {
      return {
        [key]: {
          status: 'down',
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}
