import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Socket } from 'socket.io';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { MessagingGateway } from './messaging.gateway.js';
import { MessagingService } from './messaging.service.js';
import { RedisService } from './redis.service.js';
import { WsJwtGuard } from './guards/ws-jwt.guard.js';
import {
  CHAT_SERVER_EVENTS,
  conversationRoom,
  userRoom,
} from './messaging.events.js';

describe('MessagingGateway', () => {
  let moduleRef: TestingModule;
  let gateway: MessagingGateway;
  let service: {
    assertMembership: ReturnType<typeof vi.fn>;
    createMessage: ReturnType<typeof vi.fn>;
    getParticipantIds: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
  };
  const user: AuthenticatedUser = {
    id: 'authenticated-user',
    email: 'sender@example.test',
    role: 'PARENT',
    firstName: 'Sender',
    lastName: 'Parent',
    parentId: 'parent-id',
    staffId: null,
  };
  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const server = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  };

  beforeEach(async () => {
    emitted.length = 0;
    service = {
      assertMembership: vi.fn(),
      createMessage: vi.fn().mockResolvedValue({
        message: {
          id: 'message-id',
          conversationId: 'conversation-id',
          senderId: user.id,
        },
        recipientIds: ['recipient-id'],
      }),
      getParticipantIds: vi.fn().mockResolvedValue([user.id, 'recipient-id']),
      markRead: vi.fn(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        MessagingGateway,
        { provide: WsJwtGuard, useValue: { authenticate: vi.fn() } },
        { provide: MessagingService, useValue: service },
        {
          provide: RedisService,
          useValue: {
            trackSocket: vi.fn(),
            refreshSocket: vi.fn(),
            untrackSocket: vi.fn(),
          },
        },
      ],
    }).compile();
    gateway = moduleRef.get(MessagingGateway);
    Object.defineProperty(gateway, 'server', { value: server });
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('uses the handshake-authenticated user as sender, ignoring any client senderId', async () => {
    const client = { data: { user } } as Socket;
    const payload = {
      conversationId: 'conversation-id',
      content: 'Hello',
      senderId: 'forged-id',
    };

    await gateway.sendMessage(client, payload);

    expect(service.createMessage).toHaveBeenCalledWith(
      user,
      'conversation-id',
      'Hello',
    );
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          room: conversationRoom('conversation-id'),
          event: CHAT_SERVER_EVENTS.MESSAGE,
        }),
        expect.objectContaining({
          room: userRoom('recipient-id'),
          event: CHAT_SERVER_EVENTS.NOTIFICATION,
        }),
      ]),
    );
  });

  it('does not allow a non-member to join a conversation room', async () => {
    service.assertMembership.mockRejectedValue(
      new ForbiddenException('not a member'),
    );
    const join = vi.fn();
    const client = { data: { user }, join } as unknown as Socket;

    await expect(
      gateway.joinConversation(client, {
        conversationId: 'private-conversation',
      }),
    ).rejects.toThrow('not a member');
    expect(join).not.toHaveBeenCalled();
  });
});
