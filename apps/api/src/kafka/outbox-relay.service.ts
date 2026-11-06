import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OutboxService } from "./outbox.service.js";

/** Polls the outbox and publishes due events. Runs only in the worker process. */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly outbox: OutboxService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 2000);
    this.timer.unref?.();
    this.logger.log("Outbox relay started (2s interval)");
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick() {
    if (this.running) return; // avoid overlapping batches
    this.running = true;
    try {
      await this.outbox.publishPending();
    } catch (err) {
      this.logger.error(`Outbox relay tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
