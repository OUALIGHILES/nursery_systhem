import { Logger } from "@nestjs/common";
import { MailAdminService } from "./mail.admin.service.js";
import type { MailService } from "./mail.service.js";
import type { AuditService } from "./audit.service.js";
import type { AuthenticatedUser } from "./decorators/current-user.decorator.js";

const actor = {
  id: "admin-1",
  email: "admin@example.test",
  role: "ADMIN",
  firstName: "Ada",
  lastName: "Admin",
  parentId: null,
  staffId: null,
} as AuthenticatedUser;

describe("MailAdminService", () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("status returns mode/ok without secrets", async () => {
    const mail = {
      verifyConnection: vi.fn().mockResolvedValue({ mode: "dry-run", ok: false, error: "SMTP_HOST not configured" }),
      sender: "Little Steps Nursery <no-reply@example.com>",
    } as unknown as MailService;
    const audit = { log: vi.fn() } as unknown as AuditService;
    const service = new MailAdminService(mail as never, audit as never);
    const status = await service.status();
    expect(status.mode).toBe("dry-run");
    expect(status.ok).toBe(false);
    expect(JSON.stringify(status)).not.toContain("SMTP_PASSWORD");
    expect(status.sender).toBe("placeholder");
  });

  it("sendTestEmail delegates to MailService and audits, never reports dry-run as delivered", async () => {
    const mail = { sendTestEmail: vi.fn().mockResolvedValue({ mode: "dry-run", delivered: false }) } as unknown as MailService;
    const audit = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const service = new MailAdminService(mail as never, audit as never);
    const result = await service.sendTestEmail("pat@example.test", actor, "127.0.0.1");
    expect(result).toEqual({ to: "pat@example.test", mode: "dry-run", delivered: false });
    expect(mail.sendTestEmail).toHaveBeenCalledWith("pat@example.test");
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "admin-1", action: "mail.test_email", metadata: expect.objectContaining({ mode: "dry-run", delivered: false }) }),
    );
  });
});
