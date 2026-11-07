import { Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { NotificationRepository } from "./repository/notification.repository.js";
import { NotificationDeliveryService } from "./delivery/delivery.service.js";
import { MessagingModule } from "../messaging/messaging.module.js";

@Module({
  imports: [MessagingModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationRepository, NotificationDeliveryService],
  exports: [NotificationsService, NotificationRepository, NotificationDeliveryService],
})
export class NotificationsModule {}
