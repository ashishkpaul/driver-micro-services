// src/push/push.service.ts
import { Injectable, Logger } from "@nestjs/common";
import * as admin from "firebase-admin";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(private readonly redisService: RedisService) {
    try {
      if (!admin.apps.length) {
        this.firebaseApp = admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          }),
        });
      }
      this.logger.log("Firebase initialized successfully");
    } catch (error) {
      console.log('');
      console.log('┌─ ⚠ PUSH SERVICE ' + '─'.repeat(33));
      console.log('│  Firebase not configured');
      console.log('│  Push notifications disabled');
      console.log('└' + '─'.repeat(49));
      this.logger.warn(
        `Firebase not configured — push notifications disabled. Error: ${error.message}`,
      );
      this.firebaseApp = null;
    }
  }

  /**
   * Send push to driver when WebSocket is unavailable
   */
  async sendToDriver(
    driverId: string,
    payload: {
      title: string;
      body: string;
      data: Record<string, string>;
      priority?: "normal" | "high";
    },
  ): Promise<boolean> {
    try {
      // Get FCM token from Redis
      const token = await this.redisService.getClient().get(`push:${driverId}`);
      if (!token) {
        this.logger.debug(`No push token for driver ${driverId}`);
        return false;
      }

      if (!this.firebaseApp) {
        this.logger.warn(
          "Firebase not initialized, skipping push notification",
        );
        return false;
      }

      await this.firebaseApp.messaging().send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        android: {
          priority: payload.priority || "high",
          notification: {
            channelId: "delivery-offers",
            sound: "default",
          },
        },
        webpush: {
          headers: {
            Urgency: payload.priority === "high" ? "high" : "normal",
          },
          notification: {
            icon: "/icons/icon-192.png",
            badge: "/icons/badge-72.png",
            tag: payload.data.type,
            requireInteraction: payload.priority === "high",
          },
          fcmOptions: {
            link: payload.data.deepLink || "/",
          },
        },
      });

      this.logger.log(`Push sent to driver ${driverId}: ${payload.data.type}`);
      return true;
    } catch (err) {
      // Token expired or invalid - remove it
      if (err.code === "messaging/registration-token-not-registered") {
        await this.redisService.getClient().del(`push:${driverId}`);
      }

      this.logger.error(`Push failed for driver ${driverId}:`, err.message);
      return false;
    }
  }

  /**
   * Check if push notifications are enabled
   */
  isEnabled(): boolean {
    return this.firebaseApp !== null;
  }

  /**
   * Offer notification with fallback chain: WS → Push → SMS (future)
   */
  async notifyOffer(
    offer: any,
    driverId: string,
    wsConnected: boolean,
  ): Promise<void> {
    if (wsConnected) {
      this.logger.debug(`Driver ${driverId} connected via WS, skipping push`);
      return;
    }

    if (!this.isEnabled()) {
      this.logger.warn(`Push notifications disabled for driver ${driverId}`);
      return;
    }

    await this.sendToDriver(driverId, {
      title: `₹${offer.offerPayload.estimatedEarning} delivery offer`,
      body: `Pickup in ${offer.offerPayload.estimatedPickupTime}min • ${offer.offerPayload.estimatedDistanceKm}km away`,
      data: {
        type: "DELIVERY_OFFER",
        offerId: offer.offerId,
        deliveryId: offer.deliveryId,
        expiresAt: offer.expiresAt,
        offerPayload: JSON.stringify(offer.offerPayload),
        deepLink: `/offers/${offer.offerId}`,
      },
      priority: "high",
    });
  }
}
