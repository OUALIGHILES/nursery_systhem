import { Test, type TestingModule } from "@nestjs/testing";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ClassroomsService } from "./classrooms.service.js";

describe("ClassroomsService scoping (Phase 3.2)", () => {
  let moduleRef: TestingModule;
  let service: ClassroomsService;
  let prisma: {
    classroom: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    classroomStaff: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
    childParent: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    prisma = {
      classroom: { findMany: vi.fn(), findUnique: vi.fn() },
      classroomStaff: { findMany: vi.fn(), findFirst: vi.fn() },
      childParent: { findMany: vi.fn(), findFirst: vi.fn() },
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        ClassroomsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(ClassroomsService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("admin sees all classrooms", async () => {
    prisma.classroom.findMany.mockResolvedValue([]);
    await service.list({ id: "a1", email: "a@x.test", role: "ADMIN", firstName: "A", lastName: "B" } as never);
    expect(prisma.classroomStaff.findMany).not.toHaveBeenCalled();
  });

  it("teacher sees only assigned", async () => {
    prisma.classroomStaff.findMany.mockResolvedValue([{ classroomId: "c1" }]);
    prisma.classroom.findMany.mockResolvedValue([]);
    await service.list({ id: "t1", email: "t@x.test", role: "TEACHER", firstName: "T", lastName: "B" } as never);
    expect(prisma.classroom.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: { in: ["c1"] } }));
  });

  it("parent sees only linked children's classrooms", async () => {
    prisma.childParent.findMany.mockResolvedValue([{ child: { classroomId: "c2" } }]);
    prisma.classroom.findMany.mockResolvedValue([]);
    await service.list({ id: "p1", email: "p@x.test", role: "PARENT", firstName: "P", lastName: "B" } as never);
    expect(prisma.classroom.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ id: { in: ["c2"] } }));
  });

  it("get denies unassigned teacher (404)", async () => {
    prisma.classroom.findUnique.mockResolvedValue({ id: "c9" });
    prisma.classroomStaff.findFirst.mockResolvedValue(null);
    await expect(service.get("c9", { id: "t1", email: "t@x.test", role: "TEACHER", firstName: "T", lastName: "B" } as never)).rejects.toThrow("Classroom not found");
  });
});
