/**
 * Real PostgreSQL integration tests for Phase 3.
 *
 * Prerequisites (isolated test DB, never the dev/prod DB):
 *   1. Start an isolated Postgres, e.g.
 *      docker run -d --name nursery-pg-test -e POSTGRES_USER=nursery \
 *        -e POSTGRES_PASSWORD=ghiles -e POSTGRES_DB=nursery_test \
 *        -p 5433:5432 postgres:18-alpine
 *   2. Migrate it:
 *      $env:DATABASE_URL='postgresql://nursery:ghiles@localhost:5433/nursery_test?schema=public'
 *      npm run prisma:migrate
 *   3. Run:
 *      $env:INTEGRATION_DATABASE_URL='postgresql://nursery:ghiles@localhost:5433/nursery_test?schema=public'
 *      npm run test:integration
 *
 * All fixtures use a unique suffix and are cleaned up per-test.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { EnrollmentService } from "./enrollment.service.js";

const DATABASE_URL =
  process.env.INTEGRATION_DATABASE_URL ??
  "postgresql://nursery:ghiles@localhost:5433/nursery_test?schema=public";

const actor: AuthenticatedUser = {
  id: "",
  email: "admin-test@example.test",
  role: "ADMIN",
  firstName: "Test",
  lastName: "Admin",
  parentId: null,
  staffId: null,
};

describe("Enrollment approval — real PostgreSQL (integration)", () => {
  let prisma: PrismaClient;
  let service: EnrollmentService;

  beforeAll(async () => {
    const adapter = new PrismaPg({ connectionString: DATABASE_URL });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();

    // Ensure the admin actor exists (needed for reviewedById FK? reviewedById
    // has no FK in schema, but audit actorId is nullable/no FK too — still
    // create a real admin for realism).
    const role = await prisma.role.upsert({
      where: { name: "ADMIN" },
      update: {},
      create: { name: "ADMIN", description: "integration admin" },
    });
    const admin = await prisma.user.upsert({
      where: { email: "admin-test@example.test" },
      update: {},
      create: {
        email: "admin-test@example.test",
        passwordHash: "$argon2id$v=19$m=1,t=1,p=1$dummy",
        firstName: "Test",
        lastName: "Admin",
        roleId: role.id,
      },
    });
    actor.id = admin.id;

    const audit = new AuditService(prisma as never);
    const mail = { send: async () => undefined } as unknown as MailService;
    const kafka = { publish: async () => false } as never;
    const outbox = new OutboxService(prisma as never, kafka);
    service = new EnrollmentService(prisma as never, audit, mail, outbox);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanup(suffix: string) {
    // Fixtures for this suffix only. Order respects FKs; cascades handle the
    // rest. Deleting by unique suffix keeps runs isolated and idempotent.
    await prisma.$executeRawUnsafe(
      `DELETE FROM "EnrollmentApplication" WHERE "reference" LIKE $1`,
      `LS-INT-${suffix}%`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "OutboxEvent" WHERE "payload"::text LIKE $1`,
      `%${suffix}%`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM "AuditLog" WHERE "metadata"::text LIKE $1`, `%${suffix}%`);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "Child" WHERE "firstName" LIKE $1`,
      `Int${suffix}%`,
    );
    await prisma.$executeRawUnsafe(`DELETE FROM "User" WHERE "email" LIKE $1`, `%${suffix}%@example.test`);
    await prisma.$executeRawUnsafe(`DELETE FROM "Classroom" WHERE "name" LIKE $1`, `IntClass-${suffix}%`);
  }

  function futureDate(daysAhead = 14) {
    const d = new Date(Date.now() + daysAhead * 86400_000);
    return d.toISOString().slice(0, 10);
  }

  async function makeClassroom(suffix: string, capacity = 10, program = "TODDLERS") {
    return prisma.classroom.create({
      data: {
        name: `IntClass-${suffix}-${Math.random().toString(36).slice(2, 6)}`,
        program: program as never,
        ageGroupMin: 12,
        ageGroupMax: 36,
        capacity,
        room: `R-${suffix}`,
      },
    });
  }

  async function makeApplication(suffix: string, childFirst = `Int${suffix}Casey`) {
    return prisma.enrollmentApplication.create({
      data: {
        reference: `LS-INT-${suffix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        parentFirstName: "Test",
        parentLastName: "Parent",
        parentEmail: `parent-${suffix}-${Math.random().toString(36).slice(2, 6)}@example.test`,
        parentPhone: "555-0100",
        parentAddress: "1 Test Lane",
        relation: "MOTHER",
        childFirstName: childFirst,
        childLastName: "Kid",
        childDateOfBirth: new Date("2022-03-01T00:00:00.000Z"),
        childGender: "PREFER_NOT_TO_SAY",
        requestedProgram: "TODDLERS",
        requestedStartDate: new Date(futureDate()),
        emergencyContactName: "Emergency Contact",
        emergencyContactPhone: "555-0101",
        emergencyContactRelation: "UNCLE",
      },
    });
  }

  function suiteSuffix() {
    return Math.random().toString(36).slice(2, 8);
  }

  it("two simultaneous approvals for the same application: exactly one succeeds", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 10);
    const app = await makeApplication(suffix);
    try {
      const results = await Promise.allSettled([
        service.review(app.id, { status: "APPROVED", classroomId: classroom.id }, actor),
        service.review(app.id, { status: "APPROVED", classroomId: classroom.id }, actor),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const childCount = await prisma.child.count({
        where: { firstName: app.childFirstName, lastName: app.childLastName, deletedAt: null },
      });
      expect(childCount).toBe(1);

      const enrollmentCount = await prisma.enrollment.count({
        where: { child: { firstName: app.childFirstName, lastName: app.childLastName } },
      });
      expect(enrollmentCount).toBe(1);

      const finalApp = await prisma.enrollmentApplication.findUnique({ where: { id: app.id } });
      expect(finalApp?.status).toBe("APPROVED");
    } finally {
      await cleanup(suffix);
    }
  });

  it("two different applications for the same child+parent: second is rejected as duplicate", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 10);
    const sharedEmail = `shared-${suffix}@example.test`;
    const mk = (ref: string) =>
      prisma.enrollmentApplication.create({
        data: {
          reference: ref,
          parentFirstName: "Shared",
          parentLastName: "Parent",
          parentEmail: sharedEmail,
          parentPhone: "555-0100",
          parentAddress: "Shared Lane",
          relation: "MOTHER",
          childFirstName: `Int${suffix}Twin`,
          childLastName: "Kid",
          childDateOfBirth: new Date("2022-05-01T00:00:00.000Z"),
          childGender: "FEMALE",
          requestedProgram: "TODDLERS",
          requestedStartDate: new Date(futureDate()),
          emergencyContactName: "Emergency",
          emergencyContactPhone: "555-0101",
          emergencyContactRelation: "UNCLE",
        },
      });
    const app1 = await mk(`LS-INT-${suffix}-A${Math.random().toString(36).slice(2, 5).toUpperCase()}`);
    const app2 = await mk(`LS-INT-${suffix}-B${Math.random().toString(36).slice(2, 5).toUpperCase()}`);
    try {
      const first = await service.review(app1.id, { status: "APPROVED", classroomId: classroom.id }, actor);
      expect(first.childId).toBeTruthy();

      await expect(
        service.review(app2.id, { status: "APPROVED", classroomId: classroom.id }, actor),
      ).rejects.toThrow(/already linked/i);

      const childCount = await prisma.child.count({
        where: { firstName: `Int${suffix}Twin`, lastName: "Kid", deletedAt: null },
      });
      expect(childCount).toBe(1);

      const app2After = await prisma.enrollmentApplication.findUnique({ where: { id: app2.id } });
      expect(app2After?.status).not.toBe("APPROVED");
    } finally {
      await cleanup(suffix);
      // sharedEmail users are removed by cleanup's email LIKE pattern.
    }
  });

  it("competing for the last seat: capacity is never exceeded", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 1);
    const app1 = await makeApplication(suffix, `Int${suffix}A`);
    const app2 = await makeApplication(suffix, `Int${suffix}B`);
    try {
      const results = await Promise.allSettled([
        service.review(app1.id, { status: "APPROVED", classroomId: classroom.id }, actor),
        service.review(app2.id, { status: "APPROVED", classroomId: classroom.id }, actor),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(String((rejected[0] as PromiseRejectedResult).reason)).toMatch(/capacity/i);

      const inClassroom = await prisma.child.count({
        where: { classroomId: classroom.id, deletedAt: null, status: "ACTIVE" },
      });
      expect(inClassroom).toBe(1);
    } finally {
      await cleanup(suffix);
    }
  });

  it("transaction rollback: a forced failure leaves child, enrollment, outbox, and status untouched", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 0); // capacity 0 -> TX fails at capacity re-check
    const app = await makeApplication(suffix);
    const childBefore = await prisma.child.count({ where: { firstName: app.childFirstName, deletedAt: null } });
    const outboxBefore = await prisma.outboxEvent.count();
    try {
      await expect(
        service.review(app.id, { status: "APPROVED", classroomId: classroom.id }, actor),
      ).rejects.toThrow(/capacity/i);

      const childAfter = await prisma.child.count({ where: { firstName: app.childFirstName, deletedAt: null } });
      expect(childAfter).toBe(childBefore);
      const outboxAfter = await prisma.outboxEvent.count();
      expect(outboxAfter).toBe(outboxBefore);
      const appAfter = await prisma.enrollmentApplication.findUnique({ where: { id: app.id } });
      expect(appAfter?.status).toBe("PENDING");
    } finally {
      await cleanup(suffix);
    }
  });

  it("parent account creation is unique: one User/Parent row per email", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 10);
    const sharedEmail = `concurrent-${suffix}@example.test`;
    const app = await prisma.enrollmentApplication.create({
      data: {
        reference: `LS-INT-${suffix}-P${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
        parentFirstName: "Concurrent",
        parentLastName: "Parent",
        parentEmail: sharedEmail,
        parentPhone: "555-0100",
        parentAddress: "Concurrent Lane",
        relation: "MOTHER",
        childFirstName: `Int${suffix}P`,
        childLastName: "Kid",
        childDateOfBirth: new Date("2022-06-01T00:00:00.000Z"),
        requestedProgram: "TODDLERS",
        requestedStartDate: new Date(futureDate()),
        emergencyContactName: "Emergency",
        emergencyContactPhone: "555-0101",
        emergencyContactRelation: "UNCLE",
      },
    });
    try {
      await service.review(app.id, { status: "APPROVED", classroomId: classroom.id }, actor);
      const users = await prisma.user.count({ where: { email: sharedEmail } });
      const parents = await prisma.parent.count({ where: { user: { email: sharedEmail } } });
      expect(users).toBe(1);
      expect(parents).toBe(1);

      // A direct second insert with the same email must violate the unique constraint.
      await expect(
        prisma.user.create({
          data: {
            email: sharedEmail,
            passwordHash: "$argon2id$dummy",
            firstName: "Duplicate",
            lastName: "User",
            roleId: (await prisma.role.findFirstOrThrow({ where: { name: "PARENT" } })).id,
          },
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup(suffix);
    }
  });

  it("outbox events exist only when the approval transaction commits", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 10);
    const app = await makeApplication(suffix);
    const outboxBefore = await prisma.outboxEvent.count();
    try {
      await service.review(app.id, { status: "APPROVED", classroomId: classroom.id }, actor);
      const afterSuccess = await prisma.outboxEvent.count();
      expect(afterSuccess).toBeGreaterThan(outboxBefore);

      // Duplicate-event safety: eventId is unique, so re-inserting the same
      // eventId must fail rather than create duplicate effects.
      const one = await prisma.outboxEvent.findFirst({ where: { payload: { path: ["reference"], equals: app.reference } } });
      expect(one).toBeTruthy();
      await expect(
        prisma.outboxEvent.create({ data: { eventId: one!.eventId, topic: one!.topic, payload: {} } }),
      ).rejects.toThrow();
    } finally {
      await cleanup(suffix);
    }
  });

  it("database constraints reject invalid relations", async () => {
    const suffix = suiteSuffix();
    const classroom = await makeClassroom(suffix, 10);
    const parentRole = await prisma.role.upsert({
      where: { name: "PARENT" },
      update: {},
      create: { name: "PARENT" },
    });
    const user = await prisma.user.create({
      data: {
        email: `constraint-${suffix}@example.test`,
        passwordHash: "$argon2id$dummy",
        firstName: "Constraint",
        lastName: "Parent",
        roleId: parentRole.id,
      },
    });
    const parent = await prisma.parent.create({ data: { userId: user.id } });
    const child = await prisma.child.create({
      data: {
        firstName: `Int${suffix}Constraint`,
        lastName: "Kid",
        dateOfBirth: new Date("2022-01-01T00:00:00.000Z"),
        classroomId: classroom.id,
      },
    });
    try {
      // ChildParent duplicate link violates composite PK.
      await prisma.childParent.create({ data: { childId: child.id, parentId: parent.id, relation: "MOTHER" } });
      await expect(
        prisma.childParent.create({ data: { childId: child.id, parentId: parent.id, relation: "FATHER" } }),
      ).rejects.toThrow();

      // Attendance duplicate (childId + date) violates @@unique.
      const date = new Date("2026-09-01T00:00:00.000Z");
      await prisma.attendance.create({ data: { childId: child.id, date, status: "PRESENT" } });
      await expect(
        prisma.attendance.create({ data: { childId: child.id, date, status: "ABSENT" } }),
      ).rejects.toThrow();

      // FK to a non-existent classroom must be rejected.
      await expect(
        prisma.child.create({
          data: {
            firstName: `Int${suffix}Orphan`,
            lastName: "Kid",
            dateOfBirth: new Date("2022-01-01T00:00:00.000Z"),
            classroomId: "00000000-0000-0000-0000-000000000000",
          },
        }),
      ).rejects.toThrow();
    } finally {
      await cleanup(suffix);
    }
  });
});
