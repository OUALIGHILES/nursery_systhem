import { Test, type TestingModule } from "@nestjs/testing";
import { AccessService } from "../common/access.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { ChildrenService } from "./children.service.js";

function user(role: string, id = "u1"): AuthenticatedUser {
  return { id, email: "x@example.test", role: role as AuthenticatedUser["role"], firstName: "A", lastName: "B", parentId: role === "PARENT" ? "par-1" : null, staffId: null };
}

describe("ChildrenService pickup authorization (Phase 2.3.1)", () => {
  let moduleRef: TestingModule;
  let service: ChildrenService;
  let prisma: {
    child: { findFirst: ReturnType<typeof vi.fn> };
    authorizedPickup: { create: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
    childParent: { findMany: ReturnType<typeof vi.fn> };
  };
  let access: { assertChildAccess: ReturnType<typeof vi.fn> };
  let audit: { log: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      child: { findFirst: vi.fn() },
      authorizedPickup: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
      childParent: { findMany: vi.fn().mockResolvedValue([]) },
    };
    access = { assertChildAccess: vi.fn().mockResolvedValue(undefined) };
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    moduleRef = await Test.createTestingModule({
      providers: [
        ChildrenService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: AuditService, useValue: audit },
        { provide: OutboxService, useValue: { enqueue: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ChildrenService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("parent with canPickup=true can add pickup (self-pickup only, management allowed)", async () => {
    // canPickup does NOT gate management (verified clarification). assertChildAccess is the only gate.
    prisma.child.findFirst.mockResolvedValue({ id: "c1" });
    prisma.authorizedPickup.create.mockResolvedValue({ id: "p1", childId: "c1", fullName: "Gran", relation: "Grandmother", phone: "123456", idDocument: "SECRET-ID", isActive: true });
    const result = await service.addPickup("c1", { fullName: "Gran", relation: "Grandmother", phone: "123456", idDocument: "SECRET-ID" }, user("PARENT"));
    expect(result).not.toHaveProperty("idDocument");
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "child.pickup_added", metadata: { childId: "c1" } }));
  });

  it("parent with canPickup=false can still add pickup (self-pickup only)", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1" });
    prisma.authorizedPickup.create.mockResolvedValue({ id: "p1", childId: "c1", fullName: "A", relation: "Aunt", phone: "123456", idDocument: null, isActive: true });
    await expect(service.addPickup("c1", { fullName: "A", relation: "Aunt", phone: "123456" }, user("PARENT"))).resolves.toBeDefined();
  });

  it("parent not linked is rejected", async () => {
    access.assertChildAccess.mockRejectedValueOnce(new Error("You do not have access to this child"));
    await expect(service.addPickup("c-other", { fullName: "X", relation: "Y", phone: "123456" }, user("PARENT"))).rejects.toThrow("You do not have access");
  });

  it("teacher assigned can add/remove; unassigned cannot", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1" });
    prisma.authorizedPickup.create.mockResolvedValue({ id: "p1", childId: "c1", fullName: "X", relation: "Y", phone: "123456", idDocument: null, isActive: true });
    await expect(service.addPickup("c1", { fullName: "X", relation: "Y", phone: "123456" }, user("TEACHER", "staff-1"))).resolves.toBeDefined();

    access.assertChildAccess.mockRejectedValueOnce(new Error("Child is outside your assigned classrooms"));
    await expect(service.addPickup("c-other", { fullName: "X", relation: "Y", phone: "123456" }, user("TEACHER", "staff-1"))).rejects.toThrow("outside your assigned classrooms");
  });

  it("STAFF assigned can remove with scoped lookup and audit metadata", async () => {
    prisma.authorizedPickup.findFirst.mockResolvedValue({ id: "p1", childId: "c1", isActive: true });
    prisma.authorizedPickup.update.mockResolvedValue({ id: "p1" });
    await expect(service.removePickup("c1", "p1", user("STAFF", "staff-2"))).resolves.toEqual({ message: expect.any(String) });
    expect(prisma.authorizedPickup.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", childId: "c1" } }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "child.pickup_removed", metadata: { childId: "c1" } }));
  });

  it("admin and director can add regardless of classroom", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "c1" });
    prisma.authorizedPickup.create.mockResolvedValue({ id: "p1", childId: "c1", fullName: "X", relation: "Y", phone: "123456", idDocument: null, isActive: true });
    await expect(service.addPickup("c1", { fullName: "X", relation: "Y", phone: "123456" }, user("ADMIN"))).resolves.toBeDefined();
    await expect(service.addPickup("c1", { fullName: "X", relation: "Y", phone: "123456" }, user("DIRECTOR"))).resolves.toBeDefined();
    await expect(service.addPickup("c1", { fullName: "X", relation: "Y", phone: "123456" }, user("SUPER_ADMIN"))).resolves.toBeDefined();
  });

  it("cross-child removal is 404 (scoped)", async () => {
    prisma.authorizedPickup.findFirst.mockResolvedValue(null);
    await expect(service.removePickup("c1", "p-other-child", user("ADMIN"))).rejects.toThrow("Authorized pickup not found");
  });
});
