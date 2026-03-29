import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor(private configService: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get("SMTP_HOST", "localhost"),
      port: this.configService.get("SMTP_PORT", 2525),
      secure: false, // smtp4dev doesn't use TLS
      tls: { rejectUnauthorized: false },
    });
  }

  async sendOtpEmail(to: string, otp: string): Promise<void> {
    const from = this.configService.get("SMTP_FROM", "system@zapride.local");

    const htmlTemplate = this.getOtpHtmlTemplate(otp);

    try {
      await this.transporter.sendMail({
        from,
        to,
        subject: `🔐 ${otp} is your ZapRide verification code`,
        html: htmlTemplate,
        text: `Your ZapRide verification code is: ${otp}. It expires in 5 minutes.`,
      });
      this.logger.log(`OTP email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${to}:`, error.message);
    }
  }

  private getOtpHtmlTemplate(otp: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ZapRide Verification</title>
  <style>
    body { font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; background-color: #f4f4f7; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #f4f4f7; padding: 40px 0; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 500px; border-spacing: 0; color: #1a1a2e; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
    .header { background-color: #1a1a2e; padding: 30px; text-align: center; }
    .content { padding: 40px 30px; text-align: center; }
    .otp-container { background-color: #f8f9fa; border: 2px dashed #e1e4e8; border-radius: 12px; padding: 25px; margin: 20px 0; }
    .otp-code { font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #ff5722; margin: 0; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #666; }
    @media (prefers-color-scheme: dark) {
      body, .wrapper { background-color: #0f172a !important; }
      .main { background-color: #1e293b !important; color: #f1f5f9 !important; }
      .otp-container { background-color: #334155 !important; border-color: #475569 !important; }
      .footer { color: #94a3b8 !important; }
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main">
      <tr>
        <td class="header">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;">⚡ ZapRide</h1>
        </td>
      </tr>
      <tr>
        <td class="content">
          <h2 style="margin-top: 0;">Verification Code</h2>
          <p style="color: #64748b;">Enter the code below to sign in to your account. This code is valid for <strong>5 minutes</strong>.</p>
          
          <div class="otp-container">
            <p class="otp-code">${otp}</p>
          </div>
          
          <p style="font-size: 14px; color: #64748b; margin-bottom: 0;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          &copy; 2026 ZapRide Logistics System<br>
          Automated System Message - Do Not Reply
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
  }
}
