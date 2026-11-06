import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import {
  HttpException,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Server, Socket } from 'socket.io';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { RedisService } from './redis.service.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import { MessagingService } from './messaging.service.js';
import {
  CHAT_CLIENT_EVENTS,
  CHAT_SERVER_EVENTS,
  conversationRoom,
  userRoom,
} from './messaging.events.js';
import {
  ConversationIdDto,
  MessageIdDto,
  SendMessageDto,
  TypingDto,
} from './dto/messaging.dto.js';

@WebSocketGateway({
  namespace: '/messaging',
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',').map((origin) =>
      origin.trim(),
    ) ?? ['http://localhost:3000'],
    credentials: true,
  },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
  }),
)
export class MessagingGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(MessagingGateway.name);
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(
    private readonly jwtGuard: WsJwtGuard,
    private readonly messaging: MessagingService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Server) {
    server.use((client, next) => {
      void this.jwtGuard
        .authenticate(client)
        .then((user) => {
          client.data.user = user;
          next();
        })
        .catch(() => next(new Error('Unauthorized')));
    });
    this.heartbeat = setInterval(() => {
      void server
        .fetchSockets()
        .then((clients) =>
          Promise.all(
            clients.flatMap((client) => {
              const user = client.data.user as AuthenticatedUser | undefined;
              return user
                ? [
                    this.redis
                      .refreshSocket(user.id, client.id)
                      .catch((error: Error) =>
                        this.logger.error(
                          `Presence refresh failed: ${error.message}`,
                        ),
                      ),
                  ]
                : [];
            }),
          ),
        )
        .catch((error: Error) =>
          this.logger.error(`Presence refresh failed: ${error.message}`),
        );
    }, 30_000);
    this.heartbeat.unref?.();
  }

  async handleConnection(client: Socket) {
    const user = client.data.user as AuthenticatedUser;
    try {
      await this.redis.trackSocket(user.id, client.id);
      await client.join(userRoom(user.id));
      this.server
        .to(userRoom(user.id))
        .emit(CHAT_SERVER_EVENTS.PRESENCE, { userId: user.id, online: true });
    } catch (error) {
      this.logger.error(
        `Could not initialize chat connection for user ${user.id}: ${(error as Error).message}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user) return;
    try {
      const onlineSockets = await this.redis.untrackSocket(user.id, client.id);
      if (onlineSockets === 0) {
        this.server.to(userRoom(user.id)).emit(CHAT_SERVER_EVENTS.PRESENCE, {
          userId: user.id,
          online: false,
        });
      }
    } catch (error) {
      this.logger.error(
        `Could not clear chat presence for user ${user.id}: ${(error as Error).message}`,
      );
    }
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.JOIN)
  async joinConversation(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ) {
    const user = this.user(client);
    try {
      await this.messaging.assertMembership(dto.conversationId, user.id);
      await client.join(conversationRoom(dto.conversationId));
      const participants = await this.messaging.getParticipantIds(
        dto.conversationId,
      );
      await client.join(participants.map(userRoom));
      await this.markConversationDelivered(client, dto.conversationId, user);
      return { conversationId: dto.conversationId, joined: true };
    } catch (error) {
      throw toWsException(error);
    }
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.SEND)
  async sendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: SendMessageDto,
  ) {
    try {
      const result = await this.messaging.createMessage(
        this.user(client),
        dto.conversationId,
        dto.content,
      );
      this.broadcastMessage(
        dto.conversationId,
        result.message,
        result.recipientIds,
      );
      return result.message;
    } catch (error) {
      throw toWsException(error);
    }
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.DELIVERED)
  async markDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: MessageIdDto,
  ) {
    try {
      const result = await this.messaging.markDelivered(
        this.user(client),
        dto.messageId,
      );
      if (result.deliveredAt) {
        this.server
          .to(userRoom(result.senderId))
          .emit(CHAT_SERVER_EVENTS.DELIVERED, result);
      }
      return result;
    } catch (error) {
      throw toWsException(error);
    }
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.READ)
  async markRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: ConversationIdDto,
  ) {
    try {
      const result = await this.messaging.markRead(
        this.user(client),
        dto.conversationId,
      );
      this.broadcastRead(dto.conversationId, result);
      return result;
    } catch (error) {
      throw toWsException(error);
    }
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.TYPING_START)
  async typingStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ) {
    return this.setTyping(client, dto.conversationId, true);
  }

  @SubscribeMessage(CHAT_CLIENT_EVENTS.TYPING_STOP)
  async typingStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() dto: TypingDto,
  ) {
    return this.setTyping(client, dto.conversationId, false);
  }

  broadcastMessage(
    conversationId: string,
    message: object & { id: string },
    recipientIds: string[],
  ) {
    this.server
      .to(conversationRoom(conversationId))
      .emit(CHAT_SERVER_EVENTS.MESSAGE, message);
    for (const userId of recipientIds) {
      this.server.to(userRoom(userId)).emit(CHAT_SERVER_EVENTS.NOTIFICATION, {
        conversationId,
        messageId: (message as { id: string }).id,
      });
    }
  }

  broadcastRead(conversationId: string, result: unknown) {
    this.server
      .to(conversationRoom(conversationId))
      .emit(CHAT_SERVER_EVENTS.READ, result);
  }

  broadcastDeleted(conversationId: string, messageId: string) {
    this.server
      .to(conversationRoom(conversationId))
      .emit('message:deleted', { conversationId, messageId });
  }

  onModuleDestroy() {
    if (this.heartbeat) clearInterval(this.heartbeat);
  }

  private async setTyping(
    client: Socket,
    conversationId: string,
    typing: boolean,
  ) {
    try {
      const user = this.user(client);
      await this.messaging.setTyping(user, conversationId, typing);
      client
        .to(conversationRoom(conversationId))
        .emit(CHAT_SERVER_EVENTS.TYPING, {
          conversationId,
          userId: user.id,
          firstName: user.firstName,
          typing,
        });
      return { conversationId, typing };
    } catch (error) {
      throw toWsException(error);
    }
  }

  private async markConversationDelivered(
    client: Socket,
    conversationId: string,
    user: AuthenticatedUser,
  ) {
    const pending = await this.messaging.pendingDeliveryIds(
      conversationId,
      user.id,
    );
    for (const messageId of pending) {
      const result = await this.messaging.markDelivered(user, messageId);
      if (result.deliveredAt)
        this.server
          .to(userRoom(result.senderId))
          .emit(CHAT_SERVER_EVENTS.DELIVERED, result);
    }
  }

  private user(client: Socket) {
    const user = client.data.user as AuthenticatedUser | undefined;
    if (!user) throw new WsException('Authentication required');
    return user;
  }
}

function toWsException(error: unknown) {
  if (error instanceof WsException) return error;
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'string') return new WsException(response);
    if (
      typeof response === 'object' &&
      response !== null &&
      'message' in response
    ) {
      const message = response.message;
      if (
        typeof message === 'string' ||
        (Array.isArray(message) &&
          message.every((item) => typeof item === 'string'))
      ) {
        return new WsException(message);
      }
    }
  }
  return new WsException('Messaging request failed');
}
