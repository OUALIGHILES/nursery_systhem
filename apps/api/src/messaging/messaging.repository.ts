import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

const participantInclude = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: { select: { name: true } },
    },
  },
} satisfies Prisma.ConversationParticipantInclude;

@Injectable()
export class MessagingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listConversations(
    userId: string,
    skip: number,
    take: number,
    search?: string,
  ) {
    const where: Prisma.ConversationWhereInput = {
      participants: { some: { userId } },
      ...(search
        ? {
            OR: [
              {
                participants: {
                  some: {
                    userId: { not: userId },
                    user: {
                      OR: [
                        {
                          firstName: { contains: search, mode: 'insensitive' },
                        },
                        { lastName: { contains: search, mode: 'insensitive' } },
                        { email: { contains: search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
              {
                messages: {
                  some: {
                    content: { contains: search, mode: 'insensitive' },
                    deletedAt: null,
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.conversation.findMany({
        where,
        include: {
          participants: { include: participantInclude },
          messages: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 1,
            include: {
              attachments: true,
              sender: { select: { id: true, firstName: true, lastName: true, role: { select: { name: true } } } },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.conversation.count({ where }),
    ]);

    return { items, total };
  }

  async findConversation(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: { include: participantInclude } },
    });
  }

  async findMembership(conversationId: string, userId: string) {
    return this.prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } },
    });
  }

  async findExistingDirect(
    userId: string,
    participantId: string,
    childId?: string,
  ) {
    return this.prisma.conversation.findFirst({
      where: {
        childId: childId ?? null,
        participants: {
          every: { userId: { in: [userId, participantId] } },
          some: { userId },
        },
        AND: [{ participants: { some: { userId: participantId } } }],
      },
      include: { participants: { include: participantInclude } },
    });
  }

  async createConversation(
    type: Prisma.ConversationCreateInput['type'],
    userId: string,
    participantId: string,
    childId?: string,
  ) {
    return this.prisma.conversation.create({
      data: {
        type,
        ...(childId ? { child: { connect: { id: childId } } } : {}),
        participants: {
          create: [
            { user: { connect: { id: userId } } },
            { user: { connect: { id: participantId } } },
          ],
        },
      },
      include: { participants: { include: participantInclude } },
    });
  }

  async getMessages(
    conversationId: string,
    before: Date | undefined,
    take: number,
  ) {
    return this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        ...(before ? { createdAt: { lt: before } } : {}),
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
        receipts: { select: { userId: true, deliveredAt: true, readAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
