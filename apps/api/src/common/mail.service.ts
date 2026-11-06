import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../config/env.js";

export type MailSendResult = { mode: "dry-run" | "sent"; delivered: boolean };
export type MailVerifyResult = { mode: "dry-run" | "live"; ok: boolean; error?: string };

/**
 * Environment-based mail delivery.
 *
 * Dry-run mode (SMTP_HOST not set) is explicit and never reports a
 * log-only send as a delivery. All credential-bearing bodies are redacted
 * before logging; secrets are never written to logs.
 */
@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null = null;
  private readonly from: string;
  private readonly verifyOnStartup: boolean;
  private readonly nodeEnv: string;

  constructor(config: ConfigService<Env, true>) {
    this.from = config.get("SMTP_FROM", { infer: true });
    this.nodeEnv = config.get("NODE_ENV", { infer: true });
    this.verifyOnStartup = config.get("SMTP_VERIFY_ON_STARTUP", { infer: true });
    const host = (config.get("SMTP_HOST", { infer: true }) ?? "").trim();
    if (host) {
      const port = config.get("SMTP_PORT", { infer: true });
      const user = (config.get("SMTP_USER", { infer: true }) ?? "").trim();
      // Explicit SMTP_SECURE wins; otherwise derive from port 465.
      const explicitSecure = config.get("SMTP_SECURE", { infer: true });
      const secure = host.includes("localhost") || host.includes("127.") ? explicitSecure : explicitSecure || port === 465;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: user
          ? { user, pass: config.get("SMTP_PASSWORD", { infer: true }) }
          : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      this.logger.log(`Mail configured {mode: "live", port: ${port}}`);
      if (this.from.includes("@example.com")) {
        this.logger.warn("SMTP_FROM uses the placeholder @example.com domain — replace with a verified sender domain before sending real mail");
      }
    } else {
      this.logger.warn('Mail running in dry-run mode {mode: "dry-run"} — emails will be logged, not sent');
      if (this.nodeEnv === "production") {
        this.logger.warn("Production environment with SMTP_HOST empty — no real emails will be delivered");
      }
    }
  }

  /** True when SMTP_HOST is not configured (log-only, no delivery). */
  get isDryRun(): boolean {
    return !this.transporter;
  }

  get mode(): "dry-run" | "live" {
    return this.transporter ? "live" : "dry-run";
  }

  get sender(): string {
    return this.from;
  }

  /**
   * Safe connection verification at startup. Never logs secrets, never
   * throws. In dry-run mode returns { mode: "dry-run", ok: false }.
   */
  async onModuleInit(): Promise<void> {
    if (!this.verifyOnStartup) return;
    const result = await this.verifyConnection();
    if (result.mode === "live" && !result.ok) {
      this.logger.warn(`SMTP verify failed {mode: "live", ok: false, error: ${result.error ?? "unknown"}} — mail will be attempted per-send and may fail`);
    }
  }

  async verifyConnection(): Promise<MailVerifyResult> {
    if (!this.transporter) {
      return { mode: "dry-run", ok: false, error: "SMTP_HOST not configured" };
    }
    try {
      // verification timeout: race the nodemailer verify promise against a timer
      const verifyPromise = this.transporter.verify();
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("SMTP verify timed out after 10000ms")), 10_000),
      );
      await Promise.race([verifyPromise, timeout]);
      this.logger.log("SMTP verify succeeded {mode: \"live\", ok: true}");
      return { mode: "live", ok: true };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.warn(`SMTP verify failed {mode: "live", ok: false, error: ${error.slice(0, 200)}}`);
      return { mode: "live", ok: false, error: error.slice(0, 200) };
    }
  }

  /**
   * Send a message. In dry-run mode the body is redacted and logged and
   * `delivered: false` is returned — callers must not report such sends as
   * delivered. Preserves the historical password-redaction behavior.
   */
  async send(to: string, subject: string, text: string, html?: string): Promise<MailSendResult> {
    if (!this.transporter) {
      // Dry-run must never leak credentials (temporary passwords, reset links)
      // into application logs.
      this.logger.log(`[mail:dry-run] to=${to} subject=${subject}\n${redactForLog(text)}`);
      return { mode: "dry-run", delivered: false };
    }
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        text,
        html: html ?? `<p>${escapeHtml(text)}</p>`,
      });
      this.logger.log(`mail.sent {to: "${to}", subject: "${subject}"}`);
      return { mode: "sent", delivered: true };
    } catch (err) {
      const message = (err as Error).message.slice(0, 300);
      this.logger.error(`mail.failed {to: "${to}", subject: "${subject}", error: ${message}}`);
      throw err;
    }
  }

  /**
   * Send a test email. Delivery semantics are identical to send(); the
   * caller is responsible for authorization (admin-only controller).
   */
  async sendTestEmail(to: string): Promise<MailSendResult> {
    return this.send(to, "Little Steps Nursery — mail test", "This is a test email from Little Steps Nursery. No action required.");
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Redact credential-bearing lines before dry-run logging. */
export function redactForLog(text: string): string {
  return text
    .replace(/(Temporary password:\s*).+/g, "$1[REDACTED]")
    .replace(/(New password:\s*).+/g, "$1[REDACTED]")
    .replace(/(\bpassword\s*:\s*).+/gi, "$1[REDACTED]")
    .replace(/(\/reset-password\?token=)[^\s"']+/g, "$1[REDACTED]")
    .replace(/(\/verify-email\?token=)[^\s"']+/g, "$1[REDACTED]");
}
