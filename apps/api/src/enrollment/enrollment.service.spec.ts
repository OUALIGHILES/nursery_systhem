import { Test, type TestingModule } from "@nestjs/testing";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { EnrollmentService } from "./enrollment.service.js";

const actor: AuthenticatedUser = {
  id: "admin-id",
  email: "admin@example.test",
  role: "ADMIN",
  firstName: "Ada",
  lastName: "Admin",
  parentId: null,
  staffId: null,
};

function baseApplication(overrides: Record<string, unknown> = {}) {
  return {
    id: "app-id",
    reference: "LS-TEST-001",
    parentFirstName: "Pat",
    parentLastName: "Parent",
    parentEmail: "pat@example.test",
    parentPhone: "555-0100",
    parentAddress: "1 Meadow Lane",
    relation: "MOTHER",
    childFirstName: "Casey",
    childLastName: "Kid",
    childDateOfBirth: new Date("2022-03-01T00:00:00.000Z"),
    childGender: "PREFER_NOT_TO_SAY",
    requestedProgram: "TODDLERS",
    requestedStartDate: new Date(Date.now() + 7 * 86400_000),
    emergencyContactName: "Sam Contact",
    emergencyContactPhone: "555-0101",
    emergencyContactRelation: "UNCLE",
    allergies: "Peanuts, Milk",
    medicalNotes: "Asthma inhaler",
    additionalInfo: null,
    status: "PENDING",
    adminNotes: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("EnrollmentService.review", () => {
  let moduleRef: TestingModule;
  let service: EnrollmentService;
  let prisma: Record<string, Record<string, ReturnType<typeof vi.fn>>> & {
    $transaction: ReturnType<typeof vi.fn>;
  };
  let audit: { log: ReturnType<typeof vi.fn> };
  let mail: { send: ReturnType<typeof vi.fn> };
  let outbox: { enqueue: ReturnType<typeof vi.fn> };

  function buildPrisma() {
    prisma = {
      enrollmentApplication: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      classroom: { findUnique: vi.fn(), findMany: vi.fn() },
      tuitionPlan: { findUnique: vi.fn(), findFirst: vi.fn() },
      user: { findUnique: vi.fn(), create: vi.fn() },
      role: { upsert: vi.fn() },
      parent: { create: vi.fn() },
      child: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
      childParent: { create: vi.fn() },
      allergy: { createMany: vi.fn() },
      enrollment: { create: vi.fn() },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    } as never;
  }

  beforeEach(async () => {
    buildPrisma();
    audit = { log: vi.fn().mockResolvedValue(undefined) };
    mail = { send: vi.fn().mockResolvedValue(undefined) };
    outbox = { enqueue: vi.fn().mockResolvedValue("event-id") };
    moduleRef = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
        { provide: MailService, useValue: mail },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();
    service = moduleRef.get(EnrollmentService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  function mockApprovalHappyPath() {
    const pending = baseApplication();
    const approved = { ...pending, status: "APPROVED" };
    // First findUnique = review load (PENDING), second = post-transaction fetch (APPROVED).
    prisma.enrollmentApplication.findUnique
      .mockResolvedValueOnce(pending)
      .mockResolvedValue(approved);
    prisma.classroom.findUnique.mockResolvedValue({
      id: "classroom-1",
      name: "Toddlers A",
      program: "TODDLERS",
      capacity: 10,
      isActive: true,
    });
    prisma.child.count.mockResolvedValue(2);
    prisma.child.findFirst.mockResolvedValue(null);
    prisma.tuitionPlan.findUnique.mockResolvedValue({ id: "plan-1", isActive: true });
    prisma.tuitionPlan.findFirst.mockResolvedValue(null);
    prisma.enrollmentApplication.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      role: { name: "PARENT" },
      parentProfile: { id: "parent-1" },
    });
    prisma.child.create.mockResolvedValue({ id: "child-1", firstName: "Casey", lastName: "Kid", classroomId: "classroom-1" });
    prisma.childParent.create.mockResolvedValue({});
    prisma.allergy.createMany.mockResolvedValue({ count: 2 });
    prisma.enrollment.create.mockResolvedValue({ id: "enrollment-1" });
  }

  it("approves an application, creating Child + Enrollment, linking parent/classroom, enqueueing outbox and auditing", async () => {
    mockApprovalHappyPath();

    const result = await service.review(
      "app-id",
      { status: "APPROVED", classroomId: "classroom-1", tuitionPlanId: "plan-1", adminNotes: "Welcome" },
      actor,
    );

    expect(result.childId).toBe("child-1");
    expect(result.enrollmentId).toBe("enrollment-1");
    expect(result.parentId).toBe("parent-1");
    expect(result.classroomId).toBe("classroom-1");
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.child.create).toHaveBeenCalled();
    expect(prisma.childParent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ childId: "child-1", parentId: "parent-1", isPrimary: true }),
    });
    expect(prisma.enrollment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ childId: "child-1", tuitionPlanId: "plan-1", program: "TODDLERS", status: "ACTIVE" }),
    });
    const topics = outbox.enqueue.mock.calls.map((call) => call[0]);
    expect(topics).toContain("child.enrolled");
    expect(topics).toContain("enrollment.approved");
    expect(outbox.enqueue).toHaveBeenCalledWith(
      "enrollment.approved",
      expect.objectContaining({ parentEmail: "pat@example.test", reference: "LS-TEST-001", childId: "child-1" }),
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "enrollment_application.approved", entityId: "app-id" }),
    );
    // Existing parent already has an account -> no credentials email from service.
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("creates a parent account and emails credentials when the parent does not exist yet", async () => {
    mockApprovalHappyPath();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.role.upsert.mockResolvedValue({ id: "role-parent" });
    prisma.user.create.mockResolvedValue({ id: "user-new" });
    prisma.parent.create.mockResolvedValue({ id: "parent-new" });

    const result = await service.review("app-id", { status: "APPROVED", classroomId: "classroom-1" }, actor);

    expect(result.parentId).toBe("parent-new");
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "pat@example.test", mustChangePassword: true }),
      }),
    );
    expect(mail.send).toHaveBeenCalledWith(
      "pat@example.test",
      expect.stringContaining("parent portal account"),
      expect.stringContaining("Temporary password"),
    );
  });

  it("rejects approval when the classroom is at capacity (validation failure, no child created)", async () => {
    mockApprovalHappyPath();
    prisma.child.count.mockResolvedValue(10); // capacity 10

    await expect(
      service.review("app-id", { status: "APPROVED", classroomId: "classroom-1" }, actor),
    ).rejects.toThrow("at capacity");
    expect(prisma.child.create).not.toHaveBeenCalled();
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("rejects approval when no classroom is available", async () => {
    const pending = baseApplication();
    prisma.enrollmentApplication.findUnique.mockResolvedValue(pending);
    prisma.classroom.findMany.mockResolvedValue([]);
    prisma.child.findFirst.mockResolvedValue(null);

    await expect(service.review("app-id", { status: "APPROVED" }, actor)).rejects.toThrow(
      "No available classroom",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects approval when required application fields are missing", async () => {
    prisma.enrollmentApplication.findUnique.mockResolvedValue(baseApplication({ emergencyContactPhone: "" }));

    await expect(service.review("app-id", { status: "APPROVED" }, actor)).rejects.toThrow(
      "incomplete",
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("prevents duplicate approval when the application is already APPROVED", async () => {
    prisma.enrollmentApplication.findUnique.mockResolvedValue(baseApplication({ status: "APPROVED" }));

    await expect(service.review("app-id", { status: "APPROVED" }, actor)).rejects.toThrow("already approved");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("prevents duplicate child creation when an equivalent child is already linked to the parent", async () => {
    mockApprovalHappyPath();
    prisma.child.findFirst.mockResolvedValue({ id: "existing-child" });

    await expect(
      service.review("app-id", { status: "APPROVED", classroomId: "classroom-1" }, actor),
    ).rejects.toThrow("already linked");
    expect(prisma.child.create).not.toHaveBeenCalled();
  });

  it("rolls back the transaction when a create fails (no audit log, no enrollment)", async () => {
    mockApprovalHappyPath();
    prisma.child.create.mockRejectedValue(new Error("db failure"));

    await expect(
      service.review("app-id", { status: "APPROVED", classroomId: "classroom-1", tuitionPlanId: "plan-1" }, actor),
    ).rejects.toThrow("db failure");
    expect(prisma.enrollment.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("requires a rejection reason and enqueues enrollment.rejected atomically without creating a child", async () => {
    const pending = baseApplication();
    const rejected = baseApplication({ status: "REJECTED", adminNotes: "No places" });
    // Load (PENDING) inside TX fetch (REJECTED) sequence; two review attempts below.
    prisma.enrollmentApplication.findUnique
      .mockResolvedValueOnce(pending) // load for first (failing) attempt
      .mockResolvedValueOnce(pending) // load for second attempt
      .mockResolvedValue(rejected); // inside-TX fetch + later calls
    prisma.enrollmentApplication.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.review("app-id", { status: "REJECTED" }, actor)).rejects.toThrow("rejection reason");

    const result = await service.review("app-id", { status: "REJECTED", adminNotes: "No places" }, actor);
    expect(result.childId).toBeNull();
    expect(prisma.child.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.enrollmentApplication.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: "app-id", status: { not: "APPROVED" } }) }),
    );
    // Outbox for rejection must participate in the same transaction (3rd arg = tx).
    expect(outbox.enqueue).toHaveBeenCalledWith(
      "enrollment.rejected",
      expect.objectContaining({ reference: "LS-TEST-001", parentEmail: "pat@example.test" }),
      expect.anything(),
    );
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: "enrollment_application.reviewed" }));
  });

  it("fails a stale non-approval review that races with an APPROVED claim (no overwrite, no outbox)", async () => {
    const pending = baseApplication();
    prisma.enrollmentApplication.findUnique.mockResolvedValue(pending);
    prisma.enrollmentApplication.updateMany.mockResolvedValue({ count: 0 }); // claim lost to APPROVED

    await expect(
      service.review("app-id", { status: "REJECTED", adminNotes: "No places" }, actor),
    ).rejects.toThrow("already approved");
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it("rejects review requests from non-admin actors before touching the database", async () => {
    const parent: AuthenticatedUser = {
      id: "parent-id",
      email: "pat@example.test",
      role: "PARENT",
      firstName: "Pat",
      lastName: "Parent",
      parentId: null,
      staffId: null,
    };
    await expect(service.review("app-id", { status: "APPROVED" }, parent)).rejects.toThrow(
      "Insufficient permissions",
    );
    expect(prisma.enrollmentApplication.findUnique).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("locks the classroom row before the in-transaction capacity check", async () => {
    mockApprovalHappyPath();

    await service.review("app-id", { status: "APPROVED", classroomId: "classroom-1", tuitionPlanId: "plan-1" }, actor);

    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM "Classroom"'),
      "classroom-1",
    );
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining('FROM "User"'),
      "pat@example.test",
    );
    for (const call of prisma.$queryRawUnsafe.mock.calls) {
      expect(String(call[0])).toContain("FOR UPDATE");
    }
    // Lock order (user -> classroom) keeps concurrent approvals deadlock-free.
    const queries = prisma.$queryRawUnsafe.mock.calls.map((call) => String(call[0]));
    expect(queries.findIndex((q) => q.includes('"User"'))).toBeLessThan(
      queries.findIndex((q) => q.includes('"Classroom"')),
    );
  });

  it("never includes the temporary password in the response, audit metadata, or outbox payloads", async () => {
    mockApprovalHappyPath();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.role.upsert.mockResolvedValue({ id: "role-parent" });
    prisma.user.create.mockResolvedValue({ id: "user-new" });
    prisma.parent.create.mockResolvedValue({ id: "parent-new" });

    const result = await service.review("app-id", { status: "APPROVED", classroomId: "classroom-1" }, actor);

    expect(mail.send).toHaveBeenCalledTimes(1);
    const body = String(mail.send.mock.calls[0][2]);
    const tempPassword = body.match(/Temporary password: (.+)/)?.[1]?.trim();
    expect(tempPassword).toBeTruthy();
    // 16 random bytes -> 24+ chars with the A1 suffix (128-bit entropy class).
    expect(tempPassword!.length).toBeGreaterThanOrEqual(20);
    expect(tempPassword).toMatch(/A1$/);
    expect(JSON.stringify(result)).not.toContain(tempPassword);
    expect(JSON.stringify(audit.log.mock.calls)).not.toContain(tempPassword);
    expect(JSON.stringify(outbox.enqueue.mock.calls)).not.toContain(tempPassword);
    // User record stores only the argon2 hash shape, not the raw password.
    const hash = String(prisma.user.create.mock.calls[0][0].data.passwordHash);
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(hash).not.toBe(tempPassword);
  });

  it("does not let a credentials-email failure undo a committed approval and does not log credentials", async () => {
    mockApprovalHappyPath();
    prisma.user.findUnique.mockResolvedValueOnce(null);
    prisma.role.upsert.mockResolvedValue({ id: "role-parent" });
    prisma.user.create.mockResolvedValue({ id: "user-new" });
    prisma.parent.create.mockResolvedValue({ id: "parent-new" });
    mail.send.mockRejectedValue(new Error("SMTP boom"));

    const result = await service.review("app-id", { status: "APPROVED", classroomId: "classroom-1" }, actor);

    expect(result.childId).toBe("child-1");
    expect(audit.log).toHaveBeenCalled();
  });

  it("returns 404 when the application does not exist", async () => {
    prisma.enrollmentApplication.findUnique.mockResolvedValue(null);
    await expect(service.review("missing", { status: "UNDER_REVIEW" }, actor)).rejects.toThrow("not found");
  });
});
