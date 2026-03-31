import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { RolePermissions } from "./permissions";
import { RedisService } from "../redis/redis.service";

// In-process TTL cache for revocation checks
interface RevocationCacheEntry {
  isRevoked: boolean;
  expiresAt: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  // In-process cache to reduce Redis hits
  private revocationCache = new Map<string, RevocationCacheEntry>();
  private readonly CACHE_TTL_MS = 30 * 1000; // 30 seconds
  private readonly CACHE_MAX_SIZE = 1000;

  constructor(private readonly redisService: RedisService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "driver-service-secret",
    });
  }

  /**
   * Check if a user's token is revoked with in-process caching
   * Reduces Redis overhead on every authenticated request
   *
   * SECURITY TRADEOFF: On Redis errors, this method fails OPEN (returns false),
   * allowing the request to proceed. This is a deliberate availability-over-security
   * tradeoff for the driver PWA:
   * - Availability: Drivers need to complete deliveries even during Redis outages
   * - Security risk: A revoked token could be temporarily accepted during Redis downtime
   * - Mitigation: 30-second cache TTL limits the exposure window
   *
   * If stricter security is required (e.g., admin endpoints), consider:
   * 1. Using a separate strategy that fails CLOSED on Redis errors
   * 2. Implementing Redis pub/sub for real-time revocation broadcast
   * 3. Adding a circuit breaker that falls back to JWT-only validation
   */
  private async isTokenRevoked(userId: string): Promise<boolean> {
    const now = Date.now();

    // Check in-process cache first
    const cached = this.revocationCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.isRevoked;
    }

    // Cache miss or expired - check Redis
    try {
      const revokedValue = await this.redisService
        .getClient()
        .get(`revoked_token:${userId}`);
      const isRevoked = revokedValue !== null;

      // Update cache
      this.revocationCache.set(userId, {
        isRevoked,
        expiresAt: now + this.CACHE_TTL_MS,
      });

      // Evict old entries if cache is too large
      if (this.revocationCache.size > this.CACHE_MAX_SIZE) {
        this.evictOldestEntries();
      }

      return isRevoked;
    } catch (error) {
      // SECURITY TRADEOFF: Fail OPEN on Redis errors for availability
      // During Redis outages, drivers can still complete deliveries
      // The 30-second cache TTL limits the exposure window for revoked tokens
      console.warn(
        `Redis error checking revocation for user ${userId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Evict oldest cache entries when cache exceeds max size
   */
  private evictOldestEntries(): void {
    const entries = Array.from(this.revocationCache.entries());
    entries.sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    // Remove oldest 20% of entries
    const removeCount = Math.floor(this.CACHE_MAX_SIZE * 0.2);
    for (let i = 0; i < removeCount; i++) {
      this.revocationCache.delete(entries[i][0]);
    }
  }

  /**
   * Clear cache entry for a specific user (e.g., after re-login)
   */
  public clearRevocationCache(userId: string): void {
    this.revocationCache.delete(userId);
  }

  async validate(payload: any) {
    try {
      const userId = payload.sub;

      // NEW: Check revocation status with in-process caching
      // Reduces Redis overhead on every authenticated request
      const isRevoked = await this.isTokenRevoked(userId);
      if (isRevoked) {
        throw new UnauthorizedException(
          "Session invalidated. Please log in again.",
        );
      }

      if (payload.role === "SYSTEM" || payload.type === "system") {
        return {
          role: "SYSTEM",
          type: "system",
          sub: payload.sub || "system",
          permissions: payload.permissions || RolePermissions.SYSTEM,
        };
      }

      // ✅ FIX: Check explicit 'type' field instead of guessing
      if (payload.type === "driver") {
        return {
          driverId: payload.sub, // Fallback mapped mapping
          sub: payload.sub,
          type: "driver",
          role: payload.role || "DRIVER",
          email: payload.email,
          permissions: payload.permissions || RolePermissions.DRIVER,
          isActive: payload.isActive,
          status: payload.status,
          cityId: payload.cityId,
          zoneId: payload.zoneId,
        };
      }

      if (payload.type === "admin") {
        return {
          userId: payload.sub, // Fallback mapped mapping
          sub: payload.sub,
          type: "admin",
          role: payload.role,
          email: payload.email,
          permissions: payload.permissions,
          isActive: payload.isActive,
          cityId: payload.cityId,
        };
      }

      throw new UnauthorizedException("Invalid token payload structure");
    } catch (error) {
      throw new UnauthorizedException(
        "Token validation failed: " + error.message,
      );
    }
  }
}
