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
    $transaction: ReturnType<typeof vi.fn>;
  };
  let repository: {
    findConversation: ReturnType<typeof vi.fn>;
    findExistingDirect: ReturnType<typeof vi.fn>;
    createConversation: ReturnType<typeof vi.fn>;
    findMembership: ReturnType<typeof vi.fn>;
    getMessages: ReturnType<typeof vi.fn>;
  };
  let access: { assertChildAccess: ReturnType<typeof vi.fn> };
  let outbox: { enqueue: ReturnType<typeof vi.fn> };

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
      $transaction: vi.fn(),
    };
    repository = {
      findConversation: vi.fn(),
      findExistingDirect: vi.fn(),
      createConversation: vi.fn(),
      findMembership: vi.fn(),
      getMessages: vi.fn(),
    };
    access = { assertChildAccess: vi.fn() };
    outbox = { enqueue: vi.fn() };
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
          useValue: {
            client: { incr: vi.fn().mockResolvedValue(1), expire: vi.fn() },
            isOnline: vi.fn(),
          },
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
});
