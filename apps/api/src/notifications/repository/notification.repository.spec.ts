import { Test, type TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";
import { NotificationRepository } from "./notification.repository.js";

function user(id: string) {
  return { id, email: `${id}@x.test`, role: "PARENT" as const, firstName: "A", lastName: "B" } as never;
}

describe("NotificationRepository (P7.R6)", () => {
  let repo: NotificationRepository;
  let prisma: { notification: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; updateMany: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = { notification: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn() } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [NotificationRepository, { provide: PrismaService, useValue: prisma }],
    }).compile();
    repo = moduleRef.get(NotificationRepository);
  });

  it("scopes findPage to owner and supports q search", async () => {
    prisma.notification.findMany.mockResolvedValue([]);
    prisma.notification.count.mockResolvedValue(0);
    await repo.findPage(user("u1"), { q: "lunch", page: 1, pageSize: 20 });
    const where = prisma.notification.findMany.mock.calls[0][0].where;
    expect(where).toEqual(expect.objectContaining({ userId: "u1" }));
    expect(where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ title: expect.any(Object) }), expect.objectContaining({ body: expect.any(Object) })]));
  });

  it("unreadCount scoped", async () => {
    prisma.notification.count.mockResolvedValue(2);
    await expect(repo.unreadCount(user("u1"))).resolves.toEqual({ unread: 2 });
  });

  it("markRead 404 for foreign user", async () => {
    prisma.notification.findFirst.mockResolvedValue(null);
    await expect(repo.markRead(user("u1"), "n9")).rejects.toBeInstanceOf(NotFoundException);
  });
});
