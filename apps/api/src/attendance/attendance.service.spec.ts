import { Test, type TestingModule } from "@nestjs/testing";
import { AccessService } from "../common/access.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { AttendanceService } from "./attendance.service.js";

const teacher: AuthenticatedUser = { id: "staff-1", email: "teach@example.test", role: "TEACHER", firstName: "T", lastName: "One", parentId: null, staffId: "s1" };
const parent: AuthenticatedUser = { id: "user-1", email: "pat@example.test", role: "PARENT", firstName: "Pat", lastName: "Parent", parentId: "par-1", staffId: null };

describe("AttendanceService authorization & transitions", () => {
  let moduleRef: TestingModule;
  let service: AttendanceService;
  let prisma: {
    child: { findFirst: ReturnType<typeof vi.fn> };
    authorizedPickup: { findFirst: ReturnType<typeof vi.fn> };
    attendance: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let access: { assertChildAccess: ReturnType<typeof vi.fn>; visibleChildIds: ReturnType<typeof vi.fn> };
  let outbox: { enqueue: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    prisma = {
      child: { findFirst: vi.fn() },
      authorizedPickup: { findFirst: vi.fn() },
      attendance: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0) },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        if (typeof fn === "function") {
          return fn({
            attendance: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: "att-1", checkInAt: new Date() }), update: vi.fn().mockResolvedValue({ id: "att-1" }), upsert: vi.fn().mockResolvedValue({ id: "att-1" }) },
            childParent: { findMany: vi.fn().mockResolvedValue([]) },
          });
        }
        return fn as never;
      }),
    };
    access = { assertChildAccess: vi.fn().mockResolvedValue(undefined), visibleChildIds: vi.fn().mockResolvedValue(["child-1"]) };
    outbox = { enqueue: vi.fn().mockResolvedValue("evt-1") };
    moduleRef = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
        { provide: AuditService, useValue: { log: vi.fn().mockResolvedValue(undefined) } },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();
    service = moduleRef.get(AttendanceService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("rejects parent check-in (staff only)", async () => {
    await expect(service.checkIn({ childId: "child-1" }, parent)).rejects.toThrow("Only staff");
    expect(access.assertChildAccess).not.toHaveBeenCalled();
  });

  it("rejects parent check-out (staff only)", async () => {
    await expect(service.checkOut({ childId: "child-1" }, parent)).rejects.toThrow("Only staff");
  });

  it("rejects teacher unauthorized classroom via AccessService", async () => {
    access.assertChildAccess.mockRejectedValueOnce(new Error("Child is outside your assigned classrooms"));
    prisma.child.findFirst.mockResolvedValue({ id: "child-99" });
    await expect(service.checkIn({ childId: "child-99" }, teacher)).rejects.toThrow("outside your assigned classrooms");
  });

  it("rejects parent access to other parent child (IDOR)", async () => {
    access.assertChildAccess.mockRejectedValueOnce(new Error("You do not have access to this child"));
    await expect(service.markAbsent({ childId: "child-other" }, parent)).rejects.toThrow("You do not have access");
  });

  it("list enforces parent isolation when childId not visible", async () => {
    access.visibleChildIds.mockResolvedValue(["child-1"]);
    await expect(service.list({ childId: "child-other" }, parent)).rejects.toThrow("You do not have access");
  });

  it("duplicate check-in is rejected", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "child-1", firstName: "A", lastName: "B" });
    const $tx = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ attendance: { findUnique: vi.fn().mockResolvedValue({ checkInAt: new Date() }) }, childParent: { findMany: vi.fn().mockResolvedValue([]) } }),
    );
    prisma.$transaction = $tx as never;
    await expect(service.checkIn({ childId: "child-1" }, teacher)).rejects.toThrow("already checked in");
  });

  it("check-out without check-in is rejected", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "child-1", firstName: "A", lastName: "B" });
    prisma.$transaction = vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ attendance: { findUnique: vi.fn().mockResolvedValue(null) }, childParent: { findMany: vi.fn().mockResolvedValue([]) } }),
    ) as never;
    await expect(service.checkOut({ childId: "child-1" }, teacher)).rejects.toThrow("has not been checked in");
  });

  it("invalid pickup is rejected", async () => {
    prisma.child.findFirst.mockResolvedValue({ id: "child-1" });
    prisma.authorizedPickup.findFirst.mockResolvedValue(null);
    await expect(service.checkOut({ childId: "child-1", pickupId: "pickup-1" }, teacher)).rejects.toThrow("Pickup verification failed");
  });
});
