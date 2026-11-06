import { Injectable, Logger, OnApplicationShutdown, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OutboxService } from "./outbox.service.js";
import type { Env } from "../config/env.js";

/**
 * Polls the outbox and publishes due events. Runs only in the worker
 * process (provided by WorkerModule). Never throws into the app lifecycle:
 * broker-unavailable ticks just log and retry on the next interval.
 */
@Injectable()
export class OutboxRelayService implements OnModuleInit, OnApplicationShutdown, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelayService.name);
  private readonly intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private started = false;

  constructor(
    private readonly outbox: OutboxService,
    @Optional() config?: ConfigService<Env, true>,
  ) {
    this.intervalMs = config?.get("OUTBOX_RELAY_INTERVAL_MS", { infer: true }) ?? 2000;
  }

  get isRunning(): boolean {
    return this.started && this.timer !== null;
  }

  onModuleInit() {
    if (this.started) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    this.timer.unref?.();
    this.started = true;
    this.logger.log(`outbox.relay.started {intervalMs: ${this.intervalMs}}`);
  }

  onModuleDestroy() {
    this.stopTimer();
  }

  async onApplicationShutdown() {
    this.stopTimer();
  }

  private stopTimer() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    this.logger.log("outbox.relay.stopped {running: false}");
  }

  async tick(): Promise<void> {
    if (this.running) return; // avoid overlapping batches
    this.running = true;
    try {
      const summary = await this.outbox.publishPending();
      if (summary.attempted > 0 || summary.skippedHistorical > 0) {
        this.logger.log(
          `outbox.tick {attempted: ${summary.attempted}, published: ${summary.published}, failed: ${summary.failed}, skippedHistorical: ${summary.skippedHistorical}}`,
        );
      }
    } catch (err) {
      this.logger.error(`outbox.tick.failed {error: ${(err as Error).message.slice(0, 200)}}`);
    } finally {
      this.running = false;
    }
  }
}
