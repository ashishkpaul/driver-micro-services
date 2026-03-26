import { PolicyGuard } from './policy.guard';

describe('PolicyGuard Route-Aware Mapping', () => {
  let guard: any; // Using any to access private buildPolicyContext for testing

  beforeEach(() => {
    guard = new PolicyGuard(null as any, null as any);
  });

  it('should map generic :id to driverId when path is /drivers', () => {
    const mockRequest = {
      params: { id: 'driver-uuid-789' },
      route: { path: '/drivers/:id/location' },
      body: {},
      query: {},
      user: { sub: 'driver-uuid-789', role: 'DRIVER' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDriverId).toBe('driver-uuid-789');
    expect(context.resourceDeliveryId).toBeUndefined();
  });

  it('should map generic :id to deliveryId when path is /deliveries', () => {
    const mockRequest = {
      params: { id: 'delivery-uuid-456' },
      route: { path: '/deliveries/:id/status' },
      body: {},
      query: {},
      user: { sub: 'admin-uuid-123', role: 'DISPATCHER' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDeliveryId).toBe('delivery-uuid-456');
    expect(context.resourceDriverId).toBeUndefined();
  });

  it('should prioritize specific params over inferred :id for drivers', () => {
    const mockRequest = {
      params: { id: 'generic-id', driverId: 'specific-driver-id' },
      route: { path: '/drivers/:id/location' },
      body: {},
      query: {},
      user: { sub: 'user-123', role: 'ADMIN' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDriverId).toBe('specific-driver-id');
    expect(context.resourceDeliveryId).toBeUndefined();
  });

  it('should prioritize specific params over inferred :id for deliveries', () => {
    const mockRequest = {
      params: { id: 'generic-id', deliveryId: 'specific-delivery-id' },
      route: { path: '/deliveries/:id/status' },
      body: {},
      query: {},
      user: { sub: 'user-123', role: 'DISPATCHER' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDeliveryId).toBe('specific-delivery-id');
    expect(context.resourceDriverId).toBeUndefined();
  });

  it('should handle userId fallback to sub', () => {
    const mockRequest = {
      params: { id: 'driver-uuid-789' },
      route: { path: '/drivers/:id/location' },
      body: {},
      query: {},
      user: { sub: 'user-sub-123', role: 'DRIVER' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.userId).toBe('user-sub-123');
    expect(context.resourceDriverId).toBe('driver-uuid-789');
  });

  it('should handle userId when present', () => {
    const mockRequest = {
      params: { id: 'driver-uuid-789' },
      route: { path: '/drivers/:id/location' },
      body: {},
      query: {},
      user: { userId: 'user-id-456', sub: 'user-sub-123', role: 'DRIVER' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.userId).toBe('user-id-456');
    expect(context.resourceDriverId).toBe('driver-uuid-789');
  });

  it('should handle routes without :id parameter', () => {
    const mockRequest = {
      params: { cityId: 'city-123' },
      route: { path: '/drivers' },
      body: {},
      query: {},
      user: { sub: 'user-123', role: 'ADMIN' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDriverId).toBeUndefined();
    expect(context.resourceDeliveryId).toBeUndefined();
    expect(context.resourceCityId).toBe('city-123');
  });

  it('should handle routes with neither /drivers nor /deliveries in path', () => {
    const mockRequest = {
      params: { id: 'generic-id' },
      route: { path: '/users/:id/profile' },
      body: {},
      query: {},
      user: { sub: 'user-123', role: 'ADMIN' }
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDriverId).toBeUndefined();
    expect(context.resourceDeliveryId).toBeUndefined();
  });

  it('should NOT map generic :id if the route is unknown/unprotected', () => {
    const mockRequest = {
      params: { id: 'some-random-id' },
      route: { path: '/health-check/:id' },
      body: {},
      query: {},
      user: { sub: 'user-123', role: 'ADMIN' },
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.resourceDriverId).toBeUndefined();
    expect(context.resourceDeliveryId).toBeUndefined();
  });

  it('should handle missing user object gracefully (Public Routes)', () => {
    const mockRequest = {
      params: { id: 'driver-123' },
      route: { path: '/drivers/:id' },
      body: {},
      query: {},
      // No user object (e.g., if AuthGuard failed or wasn't applied)
    };

    const context = guard.buildPolicyContext(mockRequest);
    expect(context.userId).toBeUndefined();
    expect(context.resourceDriverId).toBe('driver-123');
  });
});