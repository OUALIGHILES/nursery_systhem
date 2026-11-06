import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { normalizePage, toPage } from "../common/pagination.js";
import type { AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import type {
  CreateEnrollmentApplicationDto,
  QueryEnrollmentApplicationsDto,
  ReviewEnrollmentApplicationDto,
} from "./enrollment.dto.js";

const APPLICATION_SELECT = {
  id: true,
  reference: true,
  parentFirstName: true,
  parentLastName: true,
  parentEmail: true,
  parentPhone: true,
  parentAddress: true,
  relation: true,
  childFirstName: true,
  childLastName: true,
  childDateOfBirth: true,
  childGender: true,
  requestedProgram: true,
  requestedStartDate: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
  emergencyContactRelation: true,
  allergies: true,
  medicalNotes: true,
  additionalInfo: true,
  status: true,
  adminNotes: true,
  reviewedById: true,
  reviewedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const APPLICATION_SUMMARY_SELECT = {
  id: true,
  reference: true,
  parentFirstName: true,
  parentLastName: true,
  parentEmail: true,
  childFirstName: true,
  childLastName: true,
  requestedProgram: true,
  requestedStartDate: true,
  status: true,
  createdAt: true,
} as const;

@Injectable()
export class EnrollmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async submit(dto: CreateEnrollmentApplicationDto) {
    const dateOfBirth = new Date(dto.childDateOfBirth);
    const startDate = new Date(dto.requestedStartDate);
    if (dateOfBirth >= new Date()) {
      throw new BadRequestException("Child date of birth must be in the past");
    }
    if (startDate < new Date(new Date().toDateString())) {
      throw new BadRequestException("Requested start date cannot be in the past");
    }

    const application = await this.prisma.enrollmentApplication.create({
      data: {
        reference: `LS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`,
        parentFirstName: dto.parentFirstName.trim(),
        parentLastName: dto.parentLastName.trim(),
        parentEmail: dto.parentEmail.trim().toLowerCase(),
        parentPhone: dto.parentPhone.trim(),
        parentAddress: dto.parentAddress.trim(),
        relation: dto.relation,
        childFirstName: dto.childFirstName.trim(),
        childLastName: dto.childLastName.trim(),
        childDateOfBirth: dateOfBirth,
        childGender: dto.childGender ?? "PREFER_NOT_TO_SAY",
        requestedProgram: dto.requestedProgram,
        requestedStartDate: startDate,
        emergencyContactName: dto.emergencyContactName.trim(),
        emergencyContactPhone: dto.emergencyContactPhone.trim(),
        emergencyContactRelation: dto.emergencyContactRelation.trim(),
        allergies: dto.allergies?.trim() || null,
        medicalNotes: dto.medicalNotes?.trim() || null,
        additionalInfo: dto.additionalInfo?.trim() || null,
      },
      select: { reference: true, status: true, createdAt: true },
    });

    await this.audit.log({
      action: "enrollment_application.submitted",
      entity: "EnrollmentApplication",
      metadata: { reference: application.reference },
    });
    return application;
  }

  async list(query: QueryEnrollmentApplicationsDto) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const where = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { reference: { contains: query.q, mode: "insensitive" as const } },
              { parentEmail: { contains: query.q, mode: "insensitive" as const } },
              { parentFirstName: { contains: query.q, mode: "insensitive" as const } },
              { parentLastName: { contains: query.q, mode: "insensitive" as const } },
              { childFirstName: { contains: query.q, mode: "insensitive" as const } },
              { childLastName: { contains: query.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.enrollmentApplication.findMany({
        where,
        select: APPLICATION_SUMMARY_SELECT,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.enrollmentApplication.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async get(id: string) {
    const application = await this.prisma.enrollmentApplication.findUnique({
      where: { id },
      select: APPLICATION_SELECT,
    });
    if (!application) throw new NotFoundException("Enrollment application not found");
    return application;
  }

  async review(
    id: string,
    dto: ReviewEnrollmentApplicationDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.prisma.enrollmentApplication.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException("Enrollment application not found");

    const application = await this.prisma.enrollmentApplication.update({
      where: { id },
      data: {
        status: dto.status,
        adminNotes: dto.adminNotes === undefined ? undefined : dto.adminNotes.trim() || null,
        reviewedById: actor.id,
        reviewedAt: new Date(),
      },
      select: APPLICATION_SELECT,
    });
    await this.audit.log({
      actorId: actor.id,
      action: "enrollment_application.reviewed",
      entity: "EnrollmentApplication",
      entityId: id,
      metadata: { status: dto.status },
    });
    return application;
  }
}
