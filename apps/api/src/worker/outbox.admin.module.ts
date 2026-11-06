import { Module } from "@nestjs/common";
import { OutboxControlService } from "./outbox-control.service.js";
import { OutboxAdminController } from "./outbox.admin.controller.js";

/**
 * Admin inspection/release surface for the outbox backlog.
 * Imported by the HTTP API (AppModule) so operators can inspect
 * PENDING/FAILED rows from the dashboard without starting the worker.
 */
@Module({
  controllers: [OutboxAdminController],
  providers: [OutboxControlService],
  exports: [OutboxControlService],
})
export class OutboxAdminModule {}
