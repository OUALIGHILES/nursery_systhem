import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { MailService } from "../common/mail.service.js";
import { KafkaProducerService } from "../kafka/kafka.producer.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { Public } from "../common/decorators/public.decorator.js";

/**
 * Unauthenticated, redacted health for SMTP/Kafka/Outbox.
 * Intended for Docker/Compose healthchecks and dashboards.
 * Never returns addresses, credentials, or payloads.
 */
@ApiTags("health-internal")
@Controller("health/email")
export class EmailHealthController {
  constructor(
    private readonly mail: MailService,
    private readonly kafka: KafkaProducerService,
    private readonly outbox: OutboxService,
  ) {}

  @Public()
  @Get()
  async check() {
    const [verify, summary] = await Promise.all([
      this.mail.verifyConnection(),
      this.outbox.getPendingSummary().catch(() => ({ pending: -1, published: -1, failed: -1, byTopic: [] as never[] })),
    ]);
    return {
      smtp: { mode: verify.mode, ok: verify.ok, dryRun: this.mail.isDryRun },
      kafka: {
        configured: this.kafka.isConfigured,
        connected: this.kafka.isConnected,
        brokersConfigured: this.kafka.brokersConfigured,
      },
      outbox: summary,
    };
  }
}
