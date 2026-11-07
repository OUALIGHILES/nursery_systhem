import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { AuthenticatedUser } from '../common/decorators/current-user.decorator.js';
import { AccessService } from '../common/access.service.js';
import { OutboxService } from '../kafka/outbox.service.js';
import type { Env } from '../config/env.js';
import { ConversationType, MessageType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../common/storage.service.js';
import { MessagingRepository } from './messaging.repository.js';
import type {
  ConversationListQuery,
  MessageHistoryQuery,
} from './messaging.types.js';
import type { UploadedAttachment } from './messaging.types.js';
import type { StoredFile } from '../common/storage.service.js';
import { RedisService } from './redis.service.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'DIRECTOR'] as const;
const STAFF_ROLES = ['TEACHER', 'STAFF'] as const;
const isAdmin = (role: string) =>
  ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
const isStaff = (role: string) =>
  STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number]);

type RawUser = {
  id: string;
  firstName: string;
  lastName: string;
  role: string | { name: string };
};

function normalizeUser(user: RawUser | null | undefined) {
  if (!user) return null;
  const role = typeof user.role === 'string' ? user.role : (user.role?.name ?? '');
  return { id: user.id, firstName: user.firstName, lastName: user.lastName, role };
}


@Injectable()
export class MessagingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MessagingService.name);
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: MessagingRepository,
    private readonly access: AccessService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly redis: RedisService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit() {
    this.retentionTimer = setInterval(
      () => {
        void this.purgeExpiredMessages().catch((error: Error) =>
          this.logger.error(`Chat retention job failed: ${error.message}`),
        );
      },
      24 * 60 * 60 * 1000,
    );
    this.retentionTimer.unref?.();
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  async listConversations(
    user: AuthenticatedUser,
    query: ConversationListQuery,
  ) {
    const skip = (query.page - 1) * query.pageSize;
    const { items, total } = await this.repository.listConversations(
      user.id,
      skip,
      query.pageSize,
      query.search?.trim() || undefined,
    );

    const result = await Promise.all(
      items.map(async (conversation) => {
        const peerUser =
          conversation.participants.find(
            (participant) => participant.userId !== user.id,
          )?.user ?? null;
        const peer = normalizeUser(peerUser);
        const rawLastMessage = conversation.messages[0] ?? null;
        const lastMessage = rawLastMessage
          ? { ...rawLastMessage, sender: normalizeUser(rawLastMessage.sender) ?? rawLastMessage.sender }
          : null;
        const unreadCount = await this.prisma.messageReceipt.count({
          where: {
            userId: user.id,
            readAt: null,
            message: {
              conversationId: conversation.id,
              senderId: { not: user.id },
              deletedAt: null,
            },
          },
        });
        return {
          id: conversation.id,
          type: conversation.type,
          childId: conversation.childId,
          peer,
          lastMessage,
          unreadCount,
          online: peer ? await this.redis.isOnline(peer.id) : false,
          updatedAt: conversation.updatedAt,
        };
      }),
    );

    return {
      items: result,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }

  async createConversation(
    actor: AuthenticatedUser,
    participantId: string,
    childId?: string,
  ) {
    if (actor.id === participantId)
      throw new BadRequestException(
        'You cannot start a conversation with yourself',
      );
    const participant = await this.prisma.user.findFirst({
      where: { id: participantId, isActive: true, deletedAt: null },
      include: { role: { select: { name: true } } },
    });
    if (!participant)
      throw new NotFoundException('Conversation participant not found');
    await this.assertConversationPermission(
      actor,
      participantId,
      participant.role.name,
      childId,
    );

    const type = this.conversationType(actor.role, participant.role.name);
    const existing = await this.repository.findExistingDirect(
      actor.id,
      participantId,
      childId,
    );
    if (existing) return existing;
    return this.repository.createConversation(
      type,
      actor.id,
      participantId,
      childId,
    );
  }

  async listContacts(actor: AuthenticatedUser, search?: string) {
    const where: Prisma.UserWhereInput = {
      isActive: true,
      deletedAt: null,
      ...(search?.trim()
        ? {
            OR: [
              { firstName: { contains: search.trim(), mode: 'insensitive' } },
              { lastName: { contains: search.trim(), mode: 'insensitive' } },
              { email: { contains: search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const select = {
      id: true,
      firstName: true,
      lastName: true,
      role: { select: { name: true } },
    } as const;

    if (actor.role === 'PARENT' && actor.parentId) {
      const links = await this.prisma.childParent.findMany({
        where: { parentId: actor.parentId },
        select: {
          childId: true,
          child: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              classroomId: true,
            },
          },
        },
      });
      const classroomIds = [
        ...new Set(
          links
            .map((link) => link.child.classroomId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      const [administrators, assignments] = await Promise.all([
        this.prisma.user.findMany({
          where: { ...where, role: { name: { in: [...ADMIN_ROLES] } } },
          select,
          take: 50,
          orderBy: { firstName: 'asc' },
        }),
        classroomIds.length
          ? this.prisma.classroomStaff.findMany({
              where: {
                classroomId: { in: classroomIds },
                staff: { user: where },
              },
              select: {
                classroomId: true,
                staff: { select: { user: { select } } },
              },
              take: 100,
            })
          : Promise.resolve([]),
      ]);
      const teachers = new Map<
        string,
        {
          id: string;
          firstName: string;
          lastName: string;
          role: string;
          children: { id: string; name: string }[];
        }
      >();
      for (const assignment of assignments) {
        const user = assignment.staff.user;
        const entry = teachers.get(user.id) ?? {
          ...user,
          role: user.role.name,
          children: [],
        };
        for (const link of links) {
          if (
            link.child.classroomId === assignment.classroomId &&
            !entry.children.some((child) => child.id === link.childId)
          ) {
            entry.children.push({
              id: link.childId,
              name: `${link.child.firstName} ${link.child.lastName}`,
            });
          }
        }
        teachers.set(user.id, entry);
      }
      return [
        ...administrators.map((item) => ({
          ...item,
          role: item.role.name,
          children: [] as { id: string; name: string }[],
        })),
        ...teachers.values(),
      ];
    }

    if (isStaff(actor.role)) {
      const administrators = await this.prisma.user.findMany({
        where: { ...where, role: { name: { in: [...ADMIN_ROLES] } } },
        select,
        take: 50,
        orderBy: { firstName: 'asc' },
      });
      return administrators.map((item) => ({
        ...item,
        role: item.role.name,
        children: [] as { id: string; name: string }[],
      }));
    }

    if (!isAdmin(actor.role))
      throw new ForbiddenException('You may not search for messaging contacts');
    const [users, parentLinks] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          ...where,
          role: { name: { in: [...ADMIN_ROLES, ...STAFF_ROLES] } },
          id: { not: actor.id },
        },
        select,
        take: 50,
        orderBy: { firstName: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { ...where, role: { name: 'PARENT' } },
        select: {
          ...select,
          parentProfile: {
            select: {
              children: {
                select: {
                  childId: true,
                  child: { select: { firstName: true, lastName: true } },
                },
              },
            },
          },
        },
        take: 50,
        orderBy: { firstName: 'asc' },
      }),
    ]);
    return [
      ...users.map((item) => ({
        ...item,
        role: item.role.name,
        children: [] as { id: string; name: string }[],
      })),
      ...parentLinks.map((item) => ({
        id: item.id,
        firstName: item.firstName,
        lastName: item.lastName,
        role: item.role.name,
        children:
          item.parentProfile?.children.map((link) => ({
            id: link.childId,
            name: `${link.child.firstName} ${link.child.lastName}`,
          })) ?? [],
      })),
    ];
  }

  async listMessages(
    user: AuthenticatedUser,
    conversationId: string,
    query: MessageHistoryQuery,
  ) {
    await this.assertMembership(conversationId, user.id);
    const before = query.before ? new Date(query.before) : undefined;
    if (before && Number.isNaN(before.getTime()))
      throw new BadRequestException('Invalid message cursor');
    const rows = await this.repository.getMessages(
      conversationId,
      before,
      query.pageSize,
    );
    return rows.reverse().map((row) => ({ ...row, sender: normalizeUser(row.sender) ?? row.sender }));
  }

  async createMessage(
    actor: AuthenticatedUser,
    conversationId: string,
    content: string | undefined,
    files: UploadedAttachment[] = [],
  ) {
    const conversation = await this.repository.findConversation(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    const membership = conversation.participants.find(
      (item) => item.userId === actor.id,
    );
    if (!membership)
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
    const normalizedContent = content?.trim() || null;
    if (!normalizedContent && files.length === 0)
      throw new BadRequestException('A message or attachment is required');
    if (normalizedContent && normalizedContent.length > 5000)
      throw new BadRequestException('Message is too long');
    if (files.length > 5)
      throw new BadRequestException(
        'A message can include at most five attachments',
      );
    const sendCount = await this.redis.client.incr(`chat:rate:${actor.id}`);
    if (sendCount === 1)
      await this.redis.client.expire(`chat:rate:${actor.id}`, 10);
    if (sendCount > 30)
      throw new BadRequestException(
        'Too many messages; wait before sending again',
      );
    for (const file of files) validateAttachmentSignature(file);

    const stored: StoredFile[] = [];
    try {
      for (const file of files)
        stored.push(await this.storage.save(file, 'messages'));
    } catch (error) {
      await this.removeStoredFiles(stored.map((file) => file.storageKey));
      throw error;
    }

    const recipients = conversation.participants.filter(
      (item) => item.userId !== actor.id,
    );
    const messageType = normalizedContent
      ? MessageType.TEXT
      : files[0]?.mimetype.startsWith('image/')
        ? MessageType.IMAGE
        : MessageType.FILE;
    const messageId = randomUUID();
    try {
      const message = await this.prisma.$transaction(async (tx) => {
        const created = await tx.message.create({
          data: {
            id: messageId,
            conversationId,
            senderId: actor.id,
            recipientId: recipients.length === 1 ? recipients[0].userId : null,
            childId: conversation.childId,
            body: normalizedContent,
            content: normalizedContent,
            messageType,
            attachments: {
              create: stored.map((file) => ({
                storageKey: file.storageKey,
                fileName: file.fileName,
                mimeType: file.mimeType,
                fileSize: file.sizeBytes,
              })),
            },
            receipts: { create: recipients.map(({ userId }) => ({ userId })) },
          },
          include: {
            sender: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                role: { select: { name: true } },
              },
            },
            attachments: true,
            receipts: {
              select: { userId: true, deliveredAt: true, readAt: true },
            },
          },
        });

        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
        await tx.notification.createMany({
          data: recipients.map(({ userId }) => ({
            userId,
            type: 'MESSAGE',
            title: 'New message',
            body: `You have a new message from ${actor.firstName} ${actor.lastName}`,
            link: `/chat?conversation=${conversationId}`,
          })),
        });
        await this.outbox.enqueue(
          'chat.message.created',
          {
            messageId,
            conversationId,
            senderId: actor.id,
            recipientIds: recipients.map(({ userId }) => userId),
          },
          tx,
        );
        for (const recipient of recipients) {
          await this.outbox.enqueue(
            'chat.notification.requested',
            { messageId, conversationId, recipientId: recipient.userId },
            tx,
          );
        }
        return created;
      });
      const normalizedMessage = { ...message, sender: normalizeUser(message.sender) ?? message.sender };
      return { message: normalizedMessage, recipientIds: recipients.map(({ userId }) => userId) };
    } catch (error) {
      await this.removeStoredFiles(stored.map((file) => file.storageKey));
      throw error;
    }
  }

  async markDelivered(user: AuthenticatedUser, messageId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId: { not: null }, deletedAt: null },
      select: { id: true, senderId: true, conversationId: true },
    });
    if (!message?.conversationId)
      throw new NotFoundException('Message not found');
    await this.assertMembership(message.conversationId, user.id);
    if (message.senderId === user.id)
      return { messageId, deliveredAt: null, senderId: message.senderId };
    const deliveredAt = new Date();
    const result = await this.prisma.messageReceipt.updateMany({
      where: { messageId, userId: user.id, deliveredAt: null },
      data: { deliveredAt },
    });
    if (result.count > 0) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: { deliveredAt },
      });
    }
    return {
      messageId,
      deliveredAt: result.count > 0 ? deliveredAt : null,
      senderId: message.senderId,
    };
  }

  async markRead(user: AuthenticatedUser, conversationId: string) {
    await this.assertMembership(conversationId, user.id);
    const readAt = new Date();
    const affected = await this.prisma.$transaction(async (tx) => {
      await tx.conversationParticipant.update({
        where: { conversationId_userId: { conversationId, userId: user.id } },
        data: { lastReadAt: readAt },
      });
      const receipts = await tx.messageReceipt.updateMany({
        where: {
          userId: user.id,
          readAt: null,
          message: {
            conversationId,
            senderId: { not: user.id },
            deletedAt: null,
          },
        },
        data: { readAt },
      });
      await tx.message.updateMany({
        where: {
          conversationId,
          recipientId: user.id,
          readAt: null,
          deletedAt: null,
        },
        data: { readAt },
      });
      await this.outbox.enqueue(
        'chat.message.read',
        { conversationId, userId: user.id, readAt: readAt.toISOString() },
        tx,
      );
      return receipts.count;
    });
    return { conversationId, userId: user.id, readAt, count: affected };
  }

  async deleteMessage(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
  ) {
    await this.assertMembership(conversationId, user.id);
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, conversationId, deletedAt: null },
      include: { attachments: true },
    });
    if (!message) throw new NotFoundException('Message not found');
    if (message.senderId !== user.id && !isAdmin(user.role)) {
      throw new ForbiddenException(
        'Only the sender or an administrator can delete this message',
      );
    }
    for (const attachment of message.attachments)
      await this.storage.delete(attachment.storageKey);
    await this.prisma.$transaction([
      this.prisma.messageAttachment.deleteMany({ where: { messageId } }),
      this.prisma.message.update({
        where: { id: messageId },
        data: { content: null, body: null, deletedAt: new Date() },
      }),
    ]);
    return { messageId, deletedAt: new Date() };
  }

  async getAttachment(
    user: AuthenticatedUser,
    conversationId: string,
    messageId: string,
    attachmentId: string,
  ) {
    await this.assertMembership(conversationId, user.id);
    const attachment = await this.prisma.messageAttachment.findFirst({
      where: {
        id: attachmentId,
        messageId,
        message: { conversationId, deletedAt: null },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return {
      attachment,
      file: await this.storage.openReadStream(attachment.storageKey),
    };
  }

  async setTyping(
    user: AuthenticatedUser,
    conversationId: string,
    typing: boolean,
  ) {
    await this.assertMembership(conversationId, user.id);
    const key = `chat:typing:${conversationId}:${user.id}`;
    if (typing) await this.redis.client.set(key, '1', 'EX', 8);
    else await this.redis.client.del(key);
    return this.repository.findConversation(conversationId);
  }

  async getParticipantIds(conversationId: string) {
    const conversation = await this.repository.findConversation(conversationId);
    if (!conversation) throw new NotFoundException('Conversation not found');
    return conversation.participants.map((participant) => participant.userId);
  }

  async pendingDeliveryIds(conversationId: string, userId: string) {
    const pending = await this.prisma.messageReceipt.findMany({
      where: {
        userId,
        deliveredAt: null,
        message: { conversationId, senderId: { not: userId }, deletedAt: null },
      },
      select: { messageId: true },
      take: 100,
    });
    return pending.map((receipt) => receipt.messageId);
  }

  async assertMembership(conversationId: string, userId: string) {
    const membership = await this.repository.findMembership(
      conversationId,
      userId,
    );
    if (!membership)
      throw new ForbiddenException(
        'You are not a participant in this conversation',
      );
  }

  async authenticateSocketUser(userId: string, tokenVersion?: number) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true, deletedAt: null },
      include: {
        role: { select: { name: true } },
        parentProfile: { select: { id: true } },
        staffProfile: { select: { id: true } },
      },
    });
    if (!user) throw new NotFoundException('Account not available');
    // Access-token revocation (Phase 3): same `tv` check as JwtAuthGuard.
    if (tokenVersion !== undefined && tokenVersion !== (user.tokenVersion ?? 0)) {
      throw new ForbiddenException('Access token has been revoked');
    }
    // Same mustChangePassword enforcement as JwtAuthGuard (HTTP). Without
    // this, WebSocket chat would bypass the portal password-change gate.
    if (user.mustChangePassword) {
      throw new ForbiddenException('Password change required');
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role.name,
      firstName: user.firstName,
      lastName: user.lastName,
      parentId: user.parentProfile?.id ?? null,
      staffId: user.staffProfile?.id ?? null,
      mustChangePassword: user.mustChangePassword,
    } satisfies AuthenticatedUser;
  }

  async purgeExpiredMessages() {
    const days = this.config.get('CHAT_MESSAGE_RETENTION_DAYS', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const expired = await this.prisma.message.findMany({
      where: { conversationId: { not: null }, createdAt: { lt: cutoff } },
      select: { id: true, attachments: { select: { storageKey: true } } },
      take: 100,
    });
    for (const message of expired) {
      for (const attachment of message.attachments)
        await this.storage.delete(attachment.storageKey);
      await this.prisma.message.delete({ where: { id: message.id } });
    }
    if (expired.length)
      this.logger.log(`Purged ${expired.length} expired chat message(s)`);
  }

  private async assertConversationPermission(
    actor: AuthenticatedUser,
    participantId: string,
    participantRole: string,
    childId?: string,
  ) {
    if (actor.role === 'PARENT') {
      if (participantRole === 'PARENT')
        throw new ForbiddenException(
          'Parent-to-parent conversations are not allowed',
        );
      if (isAdmin(participantRole)) {
        if (childId) await this.access.assertChildAccess(actor, childId);
        return;
      }
      if (!isStaff(participantRole) || !childId) {
        throw new ForbiddenException(
          'Parents may message authorized staff for a linked child',
        );
      }
      await this.access.assertChildAccess(actor, childId);
      const assignment = await this.prisma.classroomStaff.findFirst({
        where: {
          staff: { userId: participantId },
          classroom: { children: { some: { id: childId } } },
        },
        select: { staffId: true },
      });
      if (!assignment)
        throw new ForbiddenException(
          'This staff member is not assigned to the selected child',
        );
      return;
    }

    if (isStaff(actor.role) && isAdmin(participantRole)) return;
    if (isStaff(actor.role))
      throw new ForbiddenException(
        'Staff may start conversations with administration',
      );

    if (isAdmin(actor.role) && participantRole === 'PARENT') {
      if (!childId)
        throw new BadRequestException(
          'A child must be selected when opening a parent conversation',
        );
      const linked = await this.prisma.childParent.findFirst({
        where: { childId, parent: { userId: participantId } },
        select: { childId: true },
      });
      if (!linked)
        throw new ForbiddenException(
          'The selected parent is not linked to this child',
        );
      return;
    }

    if (
      isAdmin(actor.role) &&
      (isAdmin(participantRole) || isStaff(participantRole))
    ) {
      if (childId) await this.access.assertChildAccess(actor, childId);
      return;
    }
    throw new ForbiddenException(
      'You may not start a conversation with this user',
    );
  }

  private conversationType(actorRole: string, participantRole: string) {
    if (actorRole === 'PARENT' || participantRole === 'PARENT') {
      return isAdmin(actorRole) || isAdmin(participantRole)
        ? ConversationType.PARENT_ADMIN
        : ConversationType.PARENT_TEACHER;
    }
    if (
      (isAdmin(actorRole) && isStaff(participantRole)) ||
      (isAdmin(participantRole) && isStaff(actorRole))
    ) {
      return ConversationType.STAFF_ADMIN;
    }
    return ConversationType.DIRECT;
  }

  private async removeStoredFiles(keys: string[]) {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (error) {
        this.logger.error(
          `Failed to clean up chat attachment ${key}: ${(error as Error).message}`,
        );
      }
    }
  }
}

function validateAttachmentSignature(file: UploadedAttachment) {
  const bytes = file.buffer;
  const matches = new Map<string, () => boolean>([
    [
      'image/jpeg',
      () =>
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff,
    ],
    [
      'image/png',
      () =>
        bytes.length >= 8 &&
        bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    ],
    [
      'image/webp',
      () =>
        bytes.length >= 12 &&
        bytes.toString('ascii', 0, 4) === 'RIFF' &&
        bytes.toString('ascii', 8, 12) === 'WEBP',
    ],
    ['application/pdf', () => bytes.toString('ascii', 0, 5) === '%PDF-'],
    [
      'application/msword',
      () =>
        bytes
          .subarray(0, 8)
          .equals(
            Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
          ),
    ],
    [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      () =>
        bytes.length >= 4 && bytes.toString('ascii', 0, 4) === 'PK\u0003\u0004',
    ],
  ]);
  if (!matches.get(file.mimetype)?.())
    throw new BadRequestException(
      'Attachment content does not match its file type',
    );
}
