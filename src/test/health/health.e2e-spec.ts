import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

describe('Health Endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/health (GET)', () => {
    it('should return basic health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });
  });

  describe('/health/readiness (GET)', () => {
    it('should return readiness status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/readiness')
        .expect(200);

      expect(response.body).toHaveProperty('ready');
      expect(response.body).toHaveProperty('currentPhase');
      expect(response.body).toHaveProperty('completedPhases');
      expect(response.body).toHaveProperty('readiness');
      expect(typeof response.body.ready).toBe('boolean');
      expect(Array.isArray(response.body.completedPhases)).toBe(true);
    });
  });

  describe('/health/status (GET)', () => {
    it('should return comprehensive system status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/status')
        .expect(200);

      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('features');
      expect(response.body).toHaveProperty('services');

      expect(response.body.system).toHaveProperty('ready');
      expect(response.body.system).toHaveProperty('currentPhase');
      expect(response.body.system).toHaveProperty('completedPhases');
    });
  });

  describe('/health/features (GET)', () => {
    it('should return feature status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/features')
        .expect(200);

      expect(response.body).toHaveProperty('push');
      expect(response.body).toHaveProperty('redis');
      expect(response.body).toHaveProperty('realtime');
      expect(response.body).toHaveProperty('outbox');
    });
  });

  describe('/health/db-pool (GET)', () => {
    it('should return database pool status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/db-pool')
        .expect(200);

      expect(response.body).toHaveProperty('healthy');
      expect(response.body).toHaveProperty('poolSize');
      expect(response.body).toHaveProperty('activeConnections');
      expect(response.body).toHaveProperty('utilization');
      expect(response.body).toHaveProperty('waitingClients');
    });

    it('should return detailed database metrics when detailed=true', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/db-pool?detailed=true')
        .expect(200);

      expect(response.body).toHaveProperty('connectionPool');
      expect(response.body).toHaveProperty('performance');
      expect(response.body).toHaveProperty('health');
      expect(response.body).toHaveProperty('timestamp');

      expect(response.body.connectionPool).toHaveProperty('healthy');
      expect(response.body.connectionPool).toHaveProperty('utilization');
      expect(response.body.performance).toHaveProperty('activeQueries');
      expect(response.body.performance).toHaveProperty('longestRunningQuery');
      expect(response.body.health).toHaveProperty('overallHealth');
    });
  });

  describe('/health/schema (GET)', () => {
    it('should return schema status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/schema')
        .expect(200);

      expect(response.body).toHaveProperty('connected');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('driftDetected');
      expect(response.body).toHaveProperty('lastConvergence');
    });

    it('should return detailed schema information when detailed=true', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/schema?detailed=true')
        .expect(200);

      expect(response.body).toHaveProperty('connected');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('driftDetected');
      expect(response.body).toHaveProperty('detailed');
      expect(response.body).toHaveProperty('timestamp');

      expect(response.body.detailed).toHaveProperty('tableCount');
      expect(response.body.detailed).toHaveProperty('columnCount');
      expect(response.body.detailed).toHaveProperty('viewCount');
      expect(response.body.detailed).toHaveProperty('functionCount');
    });
  });

  describe('/health/metrics (GET)', () => {
    it('should return system metrics', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('system');
      expect(response.body).toHaveProperty('readiness');
      expect(response.body).toHaveProperty('database');
      expect(response.body).toHaveProperty('features');
      expect(response.body).toHaveProperty('services');

      expect(response.body.system).toHaveProperty('uptime');
      expect(response.body.system).toHaveProperty('memory');
      expect(response.body.system).toHaveProperty('cpu');
      expect(response.body.system).toHaveProperty('version');
      expect(response.body.system).toHaveProperty('platform');
    });
  });

  describe('/health/components (GET)', () => {
    it('should return component health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/components')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('components');

      const components = response.body.components;
      expect(components).toHaveProperty('database');
      expect(components).toHaveProperty('schema');
      expect(components).toHaveProperty('redis');
      expect(components).toHaveProperty('realtime');
      expect(components).toHaveProperty('push');
      expect(components).toHaveProperty('outbox');
      expect(components).toHaveProperty('system');

      Object.values(components).forEach((component: any) => {
        expect(component).toHaveProperty('status');
        expect(component).toHaveProperty('dependencies');
        expect(component).toHaveProperty('details');
      });
    });
  });

  describe('/health/summary (GET)', () => {
    it('should return health summary', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/summary')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('overallHealth');
      expect(response.body).toHaveProperty('systemReady');
      expect(response.body).toHaveProperty('criticalIssues');
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('metrics');

      expect(Array.isArray(response.body.criticalIssues)).toBe(true);
      expect(response.body.summary).toHaveProperty('database');
      expect(response.body.summary).toHaveProperty('schema');
      expect(response.body.summary).toHaveProperty('redis');
      expect(response.body.summary).toHaveProperty('realtime');
      expect(response.body.summary).toHaveProperty('push');
      expect(response.body.summary).toHaveProperty('outbox');
    });
  });

  describe('/health/dashboard (GET)', () => {
    it('should return comprehensive health dashboard', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/dashboard')
        .expect(200);

      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('systemOverview');
      expect(response.body).toHaveProperty('componentStatus');
      expect(response.body).toHaveProperty('performanceMetrics');
      expect(response.body).toHaveProperty('alerts');
      expect(response.body).toHaveProperty('recommendations');

      expect(response.body.systemOverview).toHaveProperty('overallHealth');
      expect(response.body.systemOverview).toHaveProperty('systemReady');
      expect(response.body.systemOverview).toHaveProperty('uptime');
      expect(response.body.systemOverview).toHaveProperty('version');

      expect(response.body.componentStatus).toHaveProperty('database');
      expect(response.body.componentStatus).toHaveProperty('schema');
      expect(response.body.componentStatus).toHaveProperty('redis');
      expect(response.body.componentStatus).toHaveProperty('realtime');
      expect(response.body.componentStatus).toHaveProperty('push');
      expect(response.body.componentStatus).toHaveProperty('outbox');
      expect(response.body.componentStatus).toHaveProperty('system');

      expect(response.body.performanceMetrics).toHaveProperty('database');
      expect(response.body.performanceMetrics).toHaveProperty('system');

      expect(Array.isArray(response.body.alerts)).toBe(true);
      expect(Array.isArray(response.body.recommendations)).toBe(true);
    });
  });

  describe('/health/outbox (GET)', () => {
    it('should return outbox health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/health/outbox')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('info');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('details');
    });
  });
});