import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "../config/env.js";
import { PrismaModule } from "../prisma/prisma.service.js";
import { CommonModule } from "../common/common.module.js";
import { OutboxRelayService } from "../kafka/outbox-relay.service.js";
import {
  AuditEventConsumer,
  AttendanceEventConsumer,
  EmailEventConsumer,
  FinancialEventConsumer,
  NotificationEventConsumer,
} from "../kafka/consumers.js";
import { WorkerService } from "./worker.service.js";
import { OutboxControlService } from "./outbox-control.service.js";

/**
 * Worker-only module. The HTTP API's AppModule never imports this.
 * The relay starts here (not in the API) so API availability does not
 * depend on Kafka. Single process = single consumer-group membership.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    CommonModule,
  ],
  providers: [
    OutboxRelayService,
    OutboxControlService,
    AuditEventConsumer,
    NotificationEventConsumer,
    EmailEventConsumer,
    AttendanceEventConsumer,
    FinancialEventConsumer,
    WorkerService,
  ],
  exports: [OutboxRelayService, OutboxControlService, WorkerService],
})
export class WorkerModule {}
