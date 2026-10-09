import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Thin SMTP wrapper. Defaults target Gmail (smtp.gmail.com:465) — set SMTP_USER to your Gmail
 * address and SMTP_PASS to a 16-character Google App Password.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  readonly from: string;

  constructor() {
    const user = process.env.SMTP_USER?.trim();
    const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');
    const port = Number(process.env.SMTP_PORT || 465);
    this.from = process.env.MAIL_FROM?.trim() || (user ? `"ZiPilot" <${user}>` : '');
    this.transporter =
      user && pass
        ? nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port,
            secure: port === 465,
            auth: { user, pass },
          })
        : null;
    if (!this.transporter) this.logger.warn('SMTP_USER / SMTP_PASS not set — email reminders are disabled.');
  }

  get configured() {
    return !!this.transporter;
  }

  async send(to: string, subject: string, html: string, text: string) {
    if (!this.transporter) throw new Error('Email is not configured. Set SMTP_USER and SMTP_PASS in backend/.env.');
    const info = await this.transporter.sendMail({ from: this.from, to, subject, html, text });
    this.logger.log(`Sent "${subject}" to ${to} (${info.messageId})`);
    return info;
  }
}
