import { Injectable, Logger } from "@nestjs/common";
import { DriversService } from "../drivers/drivers.service";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { OffersService } from "../offers/offers.service";
import { RedisService } from "../redis/redis.service";
import { DriverStateService } from "../drivers/driver-state.service";
import { DriverStatus } from "../drivers/enums/driver-status.enum";
import { LocationUpdateEvent } from "../websocket/interfaces/websocket.interface";

@Injectable()
export class DriverRealtimeService {
  private readonly logger = new Logger(DriverRealtimeService.name);

  constructor(
    private readonly drivers: DriversService,
    private readonly deliveries: DeliveriesService,
    private readonly offers: OffersService,
    private readonly redis: RedisService,
    private readonly state: DriverStateService,
  ) {}

  /**
   * Handle driver location updates
   * Delegates to RedisService for location storage and status management
   */
  async handleLocation(
    driverId: string,
    data: LocationUpdateEvent,
  ): Promise<{ ok: boolean }> {
    try {
      await this.redis.updateDriverLocation(driverId, data.lat, data.lon);

      this.logger.debug(`Location updated for driver ${driverId}`);
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Failed to update location for driver ${driverId}:`,
        error,
      );
      return { ok: false };
    }
  }

  /**
   * Handle driver heartbeat events
   * Delegates to DriverStateService for state synchronization
   */
  async handleHeartbeat(
    driverId: string,
    payload: any,
  ): Promise<{ ok: boolean; state?: any }> {
    try {
      const state = await this.state.getState(
        driverId,
        this.deliveries,
        this.offers,
      );

      this.logger.debug(`Heartbeat processed for driver ${driverId}`);
      return { ok: true, state };
    } catch (error) {
      this.logger.error(
        `Failed to process heartbeat for driver ${driverId}:`,
        error,
      );
      return { ok: false };
    }
  }

  /**
   * Handle driver status updates
   * Delegates to DriversService for status management
   */
  async handleStatus(
    driverId: string,
    status: DriverStatus,
  ): Promise<{ ok: boolean }> {
    try {
      await this.drivers.updateStatus(driverId, status);
      this.logger.debug(`Status updated for driver ${driverId}: ${status}`);
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Failed to update status for driver ${driverId}:`,
        error,
      );
      return { ok: false };
    }
  }

  /**
   * Handle driver presence updates
   * Delegates to RedisService for presence management
   */
  async handlePresence(
    driverId: string,
    lat: number,
    lon: number,
    status: DriverStatus,
  ): Promise<{ ok: boolean }> {
    try {
      await this.redis.updateDriverPresence(driverId, lat, lon, status);

      this.logger.debug(`Presence updated for driver ${driverId}: ${status}`);
      return { ok: true };
    } catch (error) {
      this.logger.error(
        `Failed to update presence for driver ${driverId}:`,
        error,
      );
      return { ok: false };
    }
  }

  /**
   * Handle driver busy state (when assigned to delivery)
   * Delegates to RedisService for status management
   */
  async handleDriverBusy(driverId: string): Promise<{ ok: boolean }> {
    try {
      await this.redis.markDriverBusy(driverId);
      this.logger.debug(`Driver ${driverId} marked as busy`);
      return { ok: true };
    } catch (error) {
      this.logger.error(`Failed to mark driver ${driverId} as busy:`, error);
      return { ok: false };
    }
  }

  /**
   * Handle driver offline state
   * Delegates to RedisService for status management
   */
  async handleDriverOffline(driverId: string): Promise<{ ok: boolean }> {
    try {
      await this.redis.markDriverOffline(driverId);
      this.logger.debug(`Driver ${driverId} marked as offline`);
      return { ok: true };
    } catch (error) {
      this.logger.error(`Failed to mark driver ${driverId} as offline:`, error);
      return { ok: false };
    }
  }

  /**
   * Get driver state information
   * Delegates to DriverStateService for state retrieval
   */
  async getDriverState(driverId: string): Promise<any> {
    try {
      const state = await this.state.getState(
        driverId,
        this.deliveries,
        this.offers,
      );

      this.logger.debug(`State retrieved for driver ${driverId}`);
      return state;
    } catch (error) {
      this.logger.error(
        `Failed to retrieve state for driver ${driverId}:`,
        error,
      );
      throw error;
    }
  }
}
