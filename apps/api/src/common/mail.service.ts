import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../config/env";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get("SMTP_FROM", { infer: true });
    const host = config.get("SMTP_HOST", { infer: true });
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: config.get("SMTP_PORT", { infer: true }),
        secure: config.get("SMTP_PORT", { infer: true }) === 465,
        auth: config.get("SMTP_USER", { infer: true })
          ? { user: config.get("SMTP_USER", { infer: true }), pass: config.get("SMTP_PASSWORD", { infer: true }) }
          : undefined,
      });
    } else {
      this.logger.warn("SMTP_HOST not configured — emails will be logged, not sent");
    }
  }

  async send(to: string, subject: string, text: string, html?: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[mail:dry-run] to=${to} subject=${subject}\n${text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, to, subject, text, html: html ?? `<p>${escapeHtml(text)}</p>` });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
