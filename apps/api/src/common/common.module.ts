import { Global, Module } from "@nestjs/common";
import { MailService } from "../common/mail.service.js";
import { AuditService } from "../common/audit.service.js";
import { StorageService } from "../common/storage.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { KafkaModule } from "../kafka/kafka.producer.js";

@Global()
@Module({
  imports: [KafkaModule],
  providers: [MailService, AuditService, StorageService, OutboxService],
  exports: [MailService, AuditService, StorageService, OutboxService, KafkaModule],
})
export class CommonModule {}
