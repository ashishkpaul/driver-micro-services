import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { RolePermissions } from "./permissions";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly redisService: RedisService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || "driver-service-secret",
    });
  }

  async validate(payload: any) {
    try {
      const userId = payload.sub;
      
      // NEW: Hot-check Redis for revocation status
      // If the key exists, it means the user was manually logged out or disabled
      const isRevoked = await this.redisService.getClient().get(`revoked_token:${userId}`);
      if (isRevoked) {
        throw new UnauthorizedException("Session invalidated. Please log in again.");
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
