import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);
  private readonly opsAlertWebhookUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.opsAlertWebhookUrl = this.configService.get<string>('OPS_ALERT_WEBHOOK_URL', '');
  }

  /**
   * Send an alert to external monitoring systems (Slack, Discord, etc.)
   */
  async sendAlert(title: string, message: string, severity: 'info' | 'warning' | 'error' = 'warning'): Promise<void> {
    if (!this.opsAlertWebhookUrl) {
      this.logger.warn('OPS_ALERT_WEBHOOK_URL not configured, skipping alert');
      return;
    }

    try {
      const payload = {
        text: `🚨 **${severity.toUpperCase()}**: ${title}\n\n${message}`,
        username: 'Driver Microservices Monitor',
        icon_emoji: severity === 'error' ? ':red_circle:' : ':warning:'
      };

      await axios.post(this.opsAlertWebhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      });

      this.logger.log(`Alert sent successfully: ${title}`);
    } catch (error) {
      this.logger.error(
        `Failed to send alert "${title}": ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Send dead letter queue threshold breach alert
   */
  async sendDeadLetterThresholdAlert(failedCount: number, timeWindow: string): Promise<void> {
    await this.sendAlert(
      'Dead Letter Queue Threshold Exceeded',
      `High failure rate detected in dead letter queue. ${failedCount} failed events in the last ${timeWindow}.`,
      'error'
    );
  }

  /**
   * Send SLA breach alert
   */
  async sendSlaBreachAlert(breachCount: number): Promise<void> {
    await this.sendAlert(
      'SLA Breach Detected',
      `${breachCount} delivery SLA breaches detected. Please investigate delivery performance.`,
      'warning'
    );
  }

  /**
   * Send system health alert
   */
  async sendSystemHealthAlert(component: string, issue: string): Promise<void> {
    await this.sendAlert(
      'System Health Alert',
      `Component: ${component}\nIssue: ${issue}`,
      'error'
    );
  }
}