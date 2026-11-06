import { Injectable, Logger, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import {
  AuditEventConsumer,
  AttendanceEventConsumer,
  EmailEventConsumer,
  FinancialEventConsumer,
  NotificationEventConsumer,
} from "../kafka/consumers.js";
import type { BaseEventConsumer } from "../kafka/base-consumer.js";

/**
 * Worker lifecycle orchestrator (worker process only).
 *
 * Starts every consumer with bounded retries so a temporarily unavailable
 * broker does not crash the worker. Shutdown stops consumers in order
 * and is safe when start partially failed.
 */
@Injectable()
export class WorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(WorkerService.name);

  constructor(
    private readonly audit: AuditEventConsumer,
    private readonly notifications: NotificationEventConsumer,
    private readonly email: EmailEventConsumer,
    private readonly attendance: AttendanceEventConsumer,
    private readonly financial: FinancialEventConsumer,
  ) {}

  private consumers(): Array<BaseEventConsumer & { consumerGroup: string }> {
    return [this.audit, this.notifications, this.email, this.attendance, this.financial];
  }

  async onModuleInit(): Promise<void> {
    for (const consumer of this.consumers()) {
      await this.startWithRetry(consumer);
    }
    this.logger.log(`worker.ready {consumers: ${this.consumers().length}}`);
  }

  private async startWithRetry(consumer: BaseEventConsumer & { consumerGroup: string }): Promise<void> {
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await consumer.start();
        return;
      } catch (err) {
        const message = (err as Error).message;
        this.logger.warn(
          `worker.consumer.start_failed {group: "${consumer.consumerGroup}", attempt: ${attempt}/${maxAttempts}, error: ${message.slice(0, 200)}}`,
        );
        if (attempt === maxAttempts) {
          this.logger.error(
            `worker.consumer.start_give_up {group: "${consumer.consumerGroup}"} — continuing without this consumer; restart the worker when the broker is available`,
          );
          return;
        }
        await new Promise((r) => setTimeout(r, Math.min(5000, 1000 * 2 ** attempt)));
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    for (const consumer of this.consumers()) {
      try {
        await consumer.stop();
      } catch (err) {
        this.logger.warn(`worker.consumer.stop_failed {group: "${consumer.consumerGroup}", error: ${(err as Error).message.slice(0, 200)}}`);
      }
    }
    this.logger.log("worker.stopped {consumers: \"all\"}");
  }
}
