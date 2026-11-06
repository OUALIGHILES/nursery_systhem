import { Module } from "@nestjs/common";
import { MailAdminService } from "./mail.admin.service.js";
import { MailAdminController } from "./mail.admin.controller.js";

/**
 * Admin-only mail test surface. Depends on CommonModule's global
 * MailService + AuditService.
 */
@Module({
  controllers: [MailAdminController],
  providers: [MailAdminService],
  exports: [MailAdminService],
})
export class MailAdminModule {}
