import { Test, type TestingModule } from "@nestjs/testing";
import { AuditService } from "./audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

describe("AuditService", () => {
  let moduleRef: TestingModule;
  let service: AuditService;
  let prisma: { auditLog: { create: ReturnType<typeof vi.fn> } };

  beforeEach(async () => {
    prisma = { auditLog: { create: vi.fn() } };
    moduleRef = await Test.createTestingModule({
      providers: [AuditService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = moduleRef.get(AuditService);
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it("writes the audit row on success", async () => {
    prisma.auditLog.create.mockResolvedValue({});
    await service.log({ action: "enrollment_application.approved", entity: "EnrollmentApplication", entityId: "app-id" });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("never rejects when the audit write fails (business flow must not break or misreport)", async () => {
    prisma.auditLog.create.mockRejectedValue(new Error("db down"));
    await expect(
      service.log({ action: "enrollment_application.approved", entity: "EnrollmentApplication" }),
    ).resolves.toBeUndefined();
  });
});
