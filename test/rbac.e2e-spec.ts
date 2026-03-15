// test/rbac.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { loginDriver } from './helpers/auth';

describe('RBAC (e2e)', () => {
  let app: INestApplication;
  let driverToken: string;
  let adminToken: string;
  let superAdminToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Setup test tokens
    driverToken = await loginDriver('driver-1');
    // For admin tokens, we'll use a simple mock approach for now
    adminToken = 'mock-admin-token';
    superAdminToken = 'mock-superadmin-token';
  });

  describe('Driver Permissions', () => {
    it('should allow driver to update own location', () => {
      return request(app.getHttpServer())
        .patch('/drivers/driver-1/location')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ lat: 12.34, lon: 56.78 })
        .expect(200);
    });

    it('should deny driver from updating another driver location', () => {
      return request(app.getHttpServer())
        .patch('/drivers/driver-2/location')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ lat: 12.34, lon: 56.78 })
        .expect(403);
    });

    it('should deny driver from accessing admin endpoints', () => {
      return request(app.getHttpServer())
        .get('/admin/drivers')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });
  });

  describe('Admin Scope Enforcement', () => {
    it('should allow admin to list drivers in own city', () => {
      return request(app.getHttpServer())
        .get('/admin/drivers?cityId=city-1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should deny admin from listing drivers in other city', () => {
      return request(app.getHttpServer())
        .get('/admin/drivers?cityId=city-2')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });
  });

  describe('Super Admin Privileges', () => {
    it('should allow super admin to access any city', () => {
      return request(app.getHttpServer())
        .get('/admin/drivers?cityId=city-99')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .expect(200);
    });
  });
});
