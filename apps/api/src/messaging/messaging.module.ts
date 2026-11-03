import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AccessModule } from '../common/access.service.js';
import { CommonModule } from '../common/common.module.js';
import { MessagingController } from './messaging.controller.js';
import { MessagingGateway } from './messaging.gateway.js';
import { MessagingRepository } from './messaging.repository.js';
import { MessagingService } from './messaging.service.js';
import { RedisService } from './redis.service.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';

@Module({
  imports: [JwtModule.register({}), CommonModule, AccessModule],
  controllers: [MessagingController],
  providers: [
    MessagingService,
    MessagingRepository,
    MessagingGateway,
    RedisService,
    WsJwtGuard,
  ],
  exports: [MessagingService, RedisService],
})
export class MessagingModule {}
