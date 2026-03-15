import { Test, TestingModule } from '@nestjs/testing';
import { PermissionInjectionMiddleware } from './permission-injection.middleware';
import { RolePermissions } from './permissions';

describe('PermissionInjectionMiddleware', () => {
  let middleware: PermissionInjectionMiddleware;
  const baseReq = {
    params: {},
    body: {},
    query: {},
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    get: jest.fn().mockReturnValue('test-agent'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PermissionInjectionMiddleware],
    }).compile();

    middleware = module.get<PermissionInjectionMiddleware>(PermissionInjectionMiddleware);
  });

  it('should be defined', () => {
    expect(middleware).toBeDefined();
  });

  describe('enhanceUserWithPermissions', () => {
    it('should return user as is if permissions already exist', async () => {
      const user = {
        driverId: 'driver-123',
        permissions: ['driver:read:own_profile'],
      };

      const result = (middleware as any).enhanceUserWithPermissions(user, baseReq);
      expect(result).toEqual(user);
    });

    it('should enhance driver user with permissions from token context', async () => {
      const user = {
        driverId: 'driver-123',
        email: 'driver@example.com',
      };

      const result = (middleware as any).enhanceUserWithPermissions(user, baseReq);

      expect(result.permissions).toEqual(RolePermissions.DRIVER);
    });

    it('should enhance admin user with permissions from role claims', async () => {
      const user = {
        userId: 'admin-123',
        role: 'ADMIN',
      };

      const result = (middleware as any).enhanceUserWithPermissions(user, baseReq);

      expect(result.permissions).toEqual(RolePermissions.ADMIN);
    });

    it('should set empty permissions for unknown principal', async () => {
      const user = {
        sub: 'unknown',
      };

      const result = (middleware as any).enhanceUserWithPermissions(user, baseReq);

      expect(result.permissions).toEqual([]);
    });
  });

  describe('addDynamicContext', () => {
    it('should add dynamic context from request', () => {
      const user: any = {};
      const mockRequest = {
        params: { cityId: 'city-1', driverId: 'driver-1' },
        body: { zoneId: 'zone-1' },
        query: { deliveryId: 'delivery-1' },
        method: 'GET',
        path: '/api/test',
        ip: '127.0.0.1',
        get: jest.fn().mockReturnValue('test-agent'),
      };

      (middleware as any).addDynamicContext(user, mockRequest);

      expect(user.resourceCityId).toBe('city-1');
      expect(user.resourceDriverId).toBe('driver-1');
      expect(user.resourceZoneId).toBe('zone-1');
      expect(user.resourceDeliveryId).toBe('delivery-1');
      expect(user.requestedAction).toBe('GET');
      expect(user.requestedPath).toBe('/api/test');
      expect(user.requestIp).toBe('127.0.0.1');
      expect(user.userAgent).toBe('test-agent');
    });
  });
});