import { Injectable, Logger } from "@nestjs/common";
import { MailService } from "./mail.service.js";
import { AuditService } from "./audit.service.js";
import type { AuthenticatedUser } from "./decorators/current-user.decorator.js";

/**
 * Admin-restricted mail helpers. The test-email entry point lives in
 * MailAdminController and is only reachable with admin roles; no
 * arbitrary-recipient send is exposed to public routes.
 */
@Injectable()
export class MailAdminService {
  private readonly logger = new Logger(MailAdminService.name);

  constructor(
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  /** Current SMTP mode without secrets or verification side effects. */
  async status() {
    const verify = await this.mail.verifyConnection();
    return {
      mode: verify.mode,
      ok: verify.ok,
      error: verify.error ?? null,
      sender: this.mail.sender.includes("@example.com") ? "placeholder" : "configured",
    };
  }

  /**
   * Send one test email to the admin-supplied address. Never reports a
   * dry-run log as delivered. Audit-logged with actor + redacted logs.
   */
  async sendTestEmail(to: string, actor: AuthenticatedUser, ip?: string) {
    this.logger.log(`mail.test_email.requested {actor: "${actor.id}", role: "${actor.role}"}`);
    const result = await this.mail.sendTestEmail(to);
    await this.audit.log({
      actorId: actor.id,
      action: "mail.test_email",
      entity: "Mail",
      metadata: { mode: result.mode, delivered: result.delivered },
      ipAddress: ip,
    });
    return { to, mode: result.mode, delivered: result.delivered };
  }
}
