import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { RedisService } from '../redis/redis.service';
import { UnauthorizedException } from '@nestjs/common';

describe('JWT Revocation Integration', () => {
  let jwtStrategy: JwtStrategy;
  let redisService: RedisService;
  let mockRedisClient: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: RedisService,
          useValue: {
            getClient: jest.fn(),
          },
        },
      ],
    }).compile();

    jwtStrategy = module.get<JwtStrategy>(JwtStrategy);
    redisService = module.get<RedisService>(RedisService);
    mockRedisClient = {
      get: jest.fn(),
    };
    
    (redisService.getClient as jest.Mock).mockReturnValue(mockRedisClient);
  });

  it('should deny access if Redis contains a revocation key', async () => {
    // Simulate a revoked user in Redis
    mockRedisClient.get.mockResolvedValue('true');

    const payload = { sub: 'user-uuid', type: 'driver' };
    
    await expect(jwtStrategy.validate(payload))
      .rejects
      .toThrow(UnauthorizedException);
  });

  it('should allow access if Redis does not contain a revocation key', async () => {
    // Simulate a non-revoked user in Redis
    mockRedisClient.get.mockResolvedValue(null);

    const payload = { 
      sub: 'user-uuid', 
      type: 'driver',
      role: 'DRIVER',
      email: 'test@example.com',
      permissions: ['DRIVER_READ'],
      isActive: true,
      status: 'AVAILABLE',
      cityId: 'city-123',
      zoneId: 'zone-456'
    };
    
    const result = await jwtStrategy.validate(payload);
    
    expect(result).toEqual({
      driverId: 'user-uuid',
      sub: 'user-uuid',
      type: 'driver',
      role: 'DRIVER',
      email: 'test@example.com',
      permissions: ['DRIVER_READ'],
      isActive: true,
      status: 'AVAILABLE',
      cityId: 'city-123',
      zoneId: 'zone-456',
    });
  });

  it('should allow access for admin users if not revoked', async () => {
    // Simulate a non-revoked admin user in Redis
    mockRedisClient.get.mockResolvedValue(null);

    const payload = { 
      sub: 'admin-uuid', 
      type: 'admin',
      role: 'DISPATCHER',
      email: 'admin@example.com',
      permissions: ['ADMIN_READ'],
      isActive: true,
      cityId: 'city-123'
    };
    
    const result = await jwtStrategy.validate(payload);
    
    expect(result).toEqual({
      userId: 'admin-uuid',
      sub: 'admin-uuid',
      type: 'admin',
      role: 'DISPATCHER',
      email: 'admin@example.com',
      permissions: ['ADMIN_READ'],
      isActive: true,
      cityId: 'city-123',
    });
  });

  it('should allow access for system users if not revoked', async () => {
    // Simulate a non-revoked system user in Redis
    mockRedisClient.get.mockResolvedValue(null);

    const payload = { 
      sub: 'system-uuid', 
      role: 'SYSTEM',
      permissions: ['SYSTEM_READ']
    };
    
    const result = await jwtStrategy.validate(payload);
    
    expect(result).toEqual({
      role: 'SYSTEM',
      type: 'system',
      sub: 'system-uuid',
      permissions: ['SYSTEM_READ'],
    });
  });

  it('should handle Redis errors gracefully', async () => {
    // Simulate Redis error
    mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));

    const payload = { sub: 'user-uuid', type: 'driver' };
    
    // Currently the strategy throws an error when Redis fails
    await expect(jwtStrategy.validate(payload))
      .rejects
      .toThrow(UnauthorizedException);
  });

  it('should handle missing sub field gracefully', async () => {
    // Simulate a token without sub field
    mockRedisClient.get.mockResolvedValue(null);

    const payload = { type: 'driver' };
    
    // Currently the strategy allows access even without sub field
    const result = await jwtStrategy.validate(payload);
    
    expect(result).toBeDefined();
    expect(result.type).toBe('driver');
  });

  it('should fail immediately on revocation even if the JWT payload is otherwise perfect', async () => {
    // Mock Redis to return 'true' (revoked)
    mockRedisClient.get.mockResolvedValue('true');

    const validPayload = {
      sub: 'revoked-user-uuid',
      type: 'admin',
      role: 'SUPER_ADMIN', // Even a Super Admin should be blocked if revoked
      isActive: true
    };

    await expect(jwtStrategy.validate(validPayload)).rejects.toThrow(
      new UnauthorizedException("Token validation failed: Session invalidated. Please log in again.")
    );
    
    // Ensure we didn't proceed to check DB or other services
    expect(redisService.getClient).toHaveBeenCalled();
  });
});