import { Test, type TestingModule } from "@nestjs/testing";
import { AccessService } from "../common/access.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { ChildrenService } from "./children.service.js";

function user(role: string): AuthenticatedUser {
  return { id: "u1", email: "x@example.test", role: role as AuthenticatedUser["role"], firstName: "A", lastName: "B", parentId: null, staffId: null };
}

describe("ChildrenService lifecycle (Phase 2.5)", () => {
  let moduleRef: TestingModule;
  let service: ChildrenService;
  let prisma: { child: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }; classroom: { findUnique: ReturnType<typeof vi.fn> } };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = { child: { findFirst: vi.fn(), update: vi.fn() }, classroom: { findUnique: vi.fn() } };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    moduleRef = await Test.createTestingModule({
      providers: [
        ChildrenService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: { assertChildAccess: vi.fn(), visibleChildIds: vi.fn() } },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: { enqueue: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ChildrenService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("archives: sets ARCHIVED, preserves history (no delete of child)", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1", status: "ACTIVE", deletedAt: null });
    prisma.child.update.mockResolvedValue({ id: "c1", status: "ARCHIVED" });
    await expect(service.archive("c1", user("ADMIN"))).resolves.toEqual({ message: "Child archived" });
    expect(prisma.child.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ARCHIVED" } }));
    expect(prisma.child.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.anything() }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "child.archived" }));
  });

  it("archive nonexistent returns 404", async () => {
    prisma.child.findFirst.mockResolvedValue(null);
    await expect(service.archive("nope", user("ADMIN"))).rejects.toThrow("Child not found");
    expect(prisma.child.update).not.toHaveBeenCalled();
  });

  it("repeated archive is idempotent (no error)", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1", status: "ARCHIVED", deletedAt: null });
    prisma.child.update.mockResolvedValue({ id: "c1", status: "ARCHIVED" });
    await expect(service.archive("c1", user("DIRECTOR"))).resolves.toEqual({ message: "Child archived" });
  });

  it("remove is soft delete (deletedAt + ARCHIVED), not hard", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1", deletedAt: null });
    prisma.child.update.mockResolvedValue({ id: "c1" });
    await service.remove("c1", user("SUPER_ADMIN"));
    expect(prisma.child.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ deletedAt: expect.any(Date) }) }));
  });
});
