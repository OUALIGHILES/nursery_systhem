import { Test, type TestingModule } from "@nestjs/testing";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { EnrollmentService } from "./enrollment.service.js";

describe("EnrollmentService.myApplications (Parent Self-Service)", () => {
  let moduleRef: TestingModule;
  let service: EnrollmentService;
  let prisma: { enrollmentApplication: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = { enrollmentApplication: { findMany: vi.fn(), count: vi.fn() } };
    moduleRef = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: vi.fn() } },
        { provide: MailService, useValue: { send: vi.fn() } },
        { provide: OutboxService, useValue: { enqueue: vi.fn() } },
      ],
    }).compile();
    service = moduleRef.get(EnrollmentService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("returns only own applications, lowercases email, hides adminNotes unless REJECTED", async () => {
    prisma.enrollmentApplication.findMany.mockResolvedValue([
      { id: "1", reference: "LS-1", childFirstName: "A", childLastName: "B", requestedProgram: "TODDLERS", requestedStartDate: new Date(), status: "REJECTED", createdAt: new Date(), adminNotes: "no space" },
      { id: "2", reference: "LS-2", childFirstName: "C", childLastName: "D", requestedProgram: "INFANTS", requestedStartDate: new Date(), status: "APPROVED", createdAt: new Date(), adminNotes: "internal" },
    ]);
    prisma.enrollmentApplication.count.mockResolvedValue(2);
    const result = await service.myApplications("Parent@Example.Test", { page: 1, pageSize: 20 });
    expect(prisma.enrollmentApplication.findMany.mock.calls[0][0].where.parentEmail).toBe("parent@example.test");
    expect(prisma.enrollmentApplication.count.mock.calls[0][0].where.parentEmail).toBe("parent@example.test");
    expect(result.items[0].adminNotes).toBe("no space");
    expect(result.items[1].adminNotes).toBeNull();
  });

  it("returns empty list when no applications", async () => {
    prisma.enrollmentApplication.findMany.mockResolvedValue([]);
    prisma.enrollmentApplication.count.mockResolvedValue(0);
    const result = await service.myApplications("a@b.test", { page: 1, pageSize: 20 });
    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("applies status filter", async () => {
    prisma.enrollmentApplication.findMany.mockResolvedValue([]);
    prisma.enrollmentApplication.count.mockResolvedValue(0);
    await service.myApplications("a@b.test", { status: "APPROVED" as never, page: 1, pageSize: 20 });
    expect(prisma.enrollmentApplication.findMany.mock.calls[0][0].where.status).toBe("APPROVED");
  });
});
