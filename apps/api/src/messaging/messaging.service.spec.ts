import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AccessService } from '../common/access.service.js';
import { OutboxService } from '../kafka/outbox.service.js';
import { StorageService } from '../common/storage.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { MessagingRepository } from './messaging.repository.js';
import { MessagingService } from './messaging.service.js';
import { RedisService } from './redis.service.js';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';

describe('MessagingService', () => {
  let moduleRef: TestingModule;
  let service: MessagingService;
  let prisma: {
    user: { findFirst: ReturnType<typeof vi.fn> };
    classroomStaff: { findFirst: ReturnType<typeof vi.fn> };
    messageReceipt: { count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let repository: {
    listConversations: ReturnType<typeof vi.fn>;
    findConversation: ReturnType<typeof vi.fn>;
    findExistingDirect: ReturnType<typeof vi.fn>;
    createConversation: ReturnType<typeof vi.fn>;
    findMembership: ReturnType<typeof vi.fn>;
    getMessages: ReturnType<typeof vi.fn>;
  };
  let access: { assertChildAccess: ReturnType<typeof vi.fn> };
  let outbox: { enqueue: ReturnType<typeof vi.fn> };
  let redis: { client: { incr: ReturnType<typeof vi.fn>; expire: ReturnType<typeof vi.fn> }; isOnline: ReturnType<typeof vi.fn> };

  const parent: AuthenticatedUser = {
    id: 'parent-id',
    email: 'parent@example.test',
    role: 'PARENT',
    firstName: 'Taylor',
    lastName: 'Parent',
    parentId: 'parent-profile-id',
    staffId: null,
  };

  beforeEach(async () => {
    prisma = {
      user: { findFirst: vi.fn() },
      classroomStaff: { findFirst: vi.fn() },
      messageReceipt: { count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(),
    };
    repository = {
      listConversations: vi.fn(),
      findConversation: vi.fn(),
      findExistingDirect: vi.fn(),
      createConversation: vi.fn(),
      findMembership: vi.fn(),
      getMessages: vi.fn(),
    };
    access = { assertChildAccess: vi.fn() };
    outbox = { enqueue: vi.fn() };
    redis = {
      client: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn() },
      isOnline: vi.fn().mockResolvedValue(false),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        MessagingService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingRepository, useValue: repository },
        { provide: AccessService, useValue: access },
        {
          provide: StorageService,
          useValue: { save: vi.fn(), delete: vi.fn() },
        },
        { provide: OutboxService, useValue: outbox },
        {
          provide: RedisService,
          useValue: redis,
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(730) },
        },
      ],
    }).compile();
    service = moduleRef.get(MessagingService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("blocks a parent from opening a teacher conversation outside that teacher's assigned children", async () => {
    prisma.user.findFirst.mockResolvedValue({ role: { name: 'TEACHER' } });
    access.assertChildAccess.mockResolvedValue(undefined);
    prisma.classroomStaff.findFirst.mockResolvedValue(null);

    await expect(
      service.createConversation(parent, 'teacher-id', 'child-id'),
    ).rejects.toThrow('not assigned to the selected child');
    expect(access.assertChildAccess).toHaveBeenCalledWith(parent, 'child-id');
    expect(repository.createConversation).not.toHaveBeenCalled();
  });

  it('reuses or creates a parent-to-administration thread only after checking the active account', async () => {
    prisma.user.findFirst.mockResolvedValue({ role: { name: 'ADMIN' } });
    repository.findExistingDirect.mockResolvedValue(null);
    repository.createConversation.mockResolvedValue({ id: 'conversation-id' });

    const result = await service.createConversation(parent, 'admin-id');

    expect(result).toEqual({ id: 'conversation-id' });
    expect(repository.createConversation).toHaveBeenCalledWith(
      'PARENT_ADMIN',
      parent.id,
      'admin-id',
      undefined,
    );
  });

  it('rejects history access when the requester is not a conversation participant', async () => {
    repository.findMembership.mockResolvedValue(null);
    await expect(
      service.listMessages(parent, 'private-conversation', { pageSize: 50 }),
    ).rejects.toThrow('not a participant');
    expect(repository.getMessages).not.toHaveBeenCalled();
  });

  it('authenticates a socket user when tokenVersion matches and rejects stale versions', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'parent-id',
      email: 'parent@example.test',
      firstName: 'Taylor',
      lastName: 'Parent',
      role: { name: 'PARENT' },
      parentProfile: { id: 'parent-profile-id' },
      staffProfile: null,
      mustChangePassword: false,
      tokenVersion: 2,
    });
    await expect(service.authenticateSocketUser('parent-id', 2)).resolves.toMatchObject({ id: 'parent-id' });
    await expect(service.authenticateSocketUser('parent-id', 1)).rejects.toThrow('revoked');
  });

  it('rejects socket authentication when mustChangePassword is true', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'parent-id',
      email: 'parent@example.test',
      firstName: 'Taylor',
      lastName: 'Parent',
      role: { name: 'PARENT' },
      parentProfile: { id: 'parent-profile-id' },
      staffProfile: null,
      mustChangePassword: true,
      tokenVersion: 0,
    });
    await expect(service.authenticateSocketUser('parent-id', 0)).rejects.toThrow('Password change required');
  });

  it('listConversations returns peer.role as a string, not {name} object (chat-client replaceAll regression)', async () => {
    repository.listConversations.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'conv-1',
          type: 'PARENT_ADMIN',
          childId: null,
          updatedAt: new Date(),
          participants: [
            { userId: 'parent-id', user: { id: 'parent-id', firstName: 'Taylor', lastName: 'Parent', role: { name: 'PARENT' } } },
            { userId: 'admin-id', user: { id: 'admin-id', firstName: 'Ada', lastName: 'Admin', role: { name: 'SUPER_ADMIN' } } },
          ],
          messages: [],
        },
      ],
    });
    const page = await service.listConversations(parent, { page: 1, pageSize: 10 });
    const peer = page.items[0].peer as { role: unknown };
    expect(peer.role).toBe('SUPER_ADMIN');
    expect(typeof (peer.role as string).replaceAll).toBe('function');
  });
});
