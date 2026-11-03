import { Global, Module } from "@nestjs/common";
import { MailService } from "../common/mail.service";
import { AuditService } from "../common/audit.service";
import { StorageService } from "../common/storage.service";
import { OutboxService } from "../kafka/outbox.service";
import { KafkaModule } from "../kafka/kafka.producer";

@Global()
@Module({
  imports: [KafkaModule],
  providers: [MailService, AuditService, StorageService, OutboxService],
  exports: [MailService, AuditService, StorageService, OutboxService, KafkaModule],
})
export class CommonModule {}
