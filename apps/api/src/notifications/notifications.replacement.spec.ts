import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { MessagingGateway } from "../messaging/messaging.gateway.js";
import { NotificationsService } from "./notifications.service.js";
import { NotificationRepository } from "./repository/notification.repository.js";
import { NotificationDeliveryService } from "./delivery/delivery.service.js";

function user(id: string) {
  return { id, email: `${id}@x.test`, role: "PARENT" as const, firstName: "A", lastName: "B" } as never;
}

describe("NotificationsService replacement (P7.R5)", () => {
  let service: NotificationsService;
  let prisma: { notification: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = { notification: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationsService, NotificationRepository, NotificationDeliveryService, { provide: PrismaService, useValue: prisma }, { provide: MessagingGateway, useValue: undefined }],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it("lists only own notifications (userId derived)", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.list(user("u1"), { page: 1, pageSize: 20 });
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ userId: "u1" }));
  });

  it("filters unread + type", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await service.list(user("u1"), { status: "unread", type: "ENROLLMENT", page: 1, pageSize: 20 });
    expect(prisma.notification.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ userId: "u1", readAt: null, type: "ENROLLMENT" }));
  });

  it("unread count scoped", async () => {
    prisma.notification.count.mockResolvedValue(3);
    await expect(service.unreadCount(user("u1"))).resolves.toEqual({ unread: 3 });
    expect(prisma.notification.count).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", readAt: null } }));
  });

  it("markRead idempotent + 404 for foreign", async () => {
    prisma.notification.findFirst.mockResolvedValue({ id: "n1" });
    prisma.notification.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.markRead(user("u1"), "n1")).resolves.toEqual({ id: "n1", read: true });
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(service.markRead(user("u1"), "other")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("markAllRead updates only own unread", async () => {
    prisma.notification.updateMany.mockResolvedValue({ count: 5 });
    await expect(service.markAllRead(user("u1"))).resolves.toEqual({ updated: 5 });
    expect(prisma.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "u1", readAt: null } }));
  });
});
