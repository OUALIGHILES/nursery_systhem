import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { AuditService } from "../common/audit.service.js";
import { MailService } from "../common/mail.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
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
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly outbox: OutboxService,
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
      select: { id: true, reference: true, status: true, createdAt: true },
    });

    await this.audit.log({
      action: "enrollment_application.submitted",
      entity: "EnrollmentApplication",
      metadata: { reference: application.reference },
    });
    await this.outbox.enqueue("enrollment.submitted", {
      id: application.id,
      reference: application.reference,
      parentEmail: dto.parentEmail.trim().toLowerCase(),
      childName: `${dto.childFirstName.trim()} ${dto.childLastName.trim()}`,
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

  async myApplications(parentEmail: string, query: QueryEnrollmentApplicationsDto) {
    const { skip, take, page, pageSize } = normalizePage(query);
    const email = parentEmail.toLowerCase().trim();
    const where = {
      parentEmail: email,
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.enrollmentApplication.findMany({
        where,
        select: {
          id: true,
          reference: true,
          childFirstName: true,
          childLastName: true,
          requestedProgram: true,
          requestedStartDate: true,
          status: true,
          createdAt: true,
          adminNotes: true,
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      this.prisma.enrollmentApplication.count({ where }),
    ]);
    const safe = items.map((a) => ({
      ...a,
      adminNotes: a.status === "REJECTED" ? a.adminNotes : null,
    }));
    return toPage(safe, total, page, pageSize);
  }

  async get(id: string) {
    const application = await this.prisma.enrollmentApplication.findUnique({
      where: { id },
      select: APPLICATION_SELECT,
    });
    if (!application) throw new NotFoundException("Enrollment application not found");
    return application;
  }

  async review(id: string, dto: ReviewEnrollmentApplicationDto, actor: AuthenticatedUser) {
    // Defense-in-depth: controller (@Roles) is the primary gate, but the service
    // must not approve/reject when invoked directly by a non-admin caller.
    if (!["SUPER_ADMIN", "ADMIN", "DIRECTOR"].includes(actor.role)) {
      throw new ForbiddenException("Insufficient permissions for this resource");
    }
    const application = await this.prisma.enrollmentApplication.findUnique({
      where: { id },
      select: APPLICATION_SELECT,
    });
    if (!application) throw new NotFoundException("Enrollment application not found");

    if (application.status === "APPROVED") {
      throw new ConflictException("Enrollment application is already approved — duplicate approval prevented");
    }

    // ---- Non-approval transitions: status change only, no Child/Enrollment ----
    if (dto.status !== "APPROVED") {
      if (dto.status === "REJECTED" && !dto.adminNotes?.trim()) {
        throw new BadRequestException("adminNotes (rejection reason) is required when rejecting an application");
      }
      // Atomic: conditional claim + outbox in a single transaction. The
      // status != APPROVED guard prevents a stale non-approval review from
      // overwriting an APPROVED application committed concurrently.
      const updated = await this.prisma.$transaction(async (tx) => {
        const claim = await tx.enrollmentApplication.updateMany({
          where: { id, status: { not: "APPROVED" } },
          data: {
            status: dto.status,
            adminNotes: dto.adminNotes === undefined ? undefined : dto.adminNotes.trim() || null,
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        });
        if (claim.count === 0) {
          throw new ConflictException("Enrollment application is already approved — duplicate approval prevented");
        }
        if (dto.status === "REJECTED") {
          // Triggers existing EmailEventConsumer + NotificationEventConsumer
          await this.outbox.enqueue(
            "enrollment.rejected",
            {
              id: application.id,
              applicationId: application.id,
              reference: application.reference,
              parentEmail: application.parentEmail,
              parentName: `${application.parentFirstName} ${application.parentLastName}`,
              childName: `${application.childFirstName} ${application.childLastName}`,
              program: application.requestedProgram,
              adminNotes: dto.adminNotes?.trim() ?? "",
            },
            tx,
          );
        }
        return tx.enrollmentApplication.findUnique({ where: { id }, select: APPLICATION_SELECT });
      });
      await this.audit.log({
        actorId: actor.id,
        action: "enrollment_application.reviewed",
        entity: "EnrollmentApplication",
        entityId: id,
        metadata: { status: dto.status },
      });
      return { ...(updated ?? application), childId: null, enrollmentId: null, parentId: null, classroomId: null };
    }

    // ---- Approval: validate application completeness ----
    const required: Array<[string, unknown]> = [
      ["parentFirstName", application.parentFirstName],
      ["parentLastName", application.parentLastName],
      ["parentEmail", application.parentEmail],
      ["parentPhone", application.parentPhone],
      ["parentAddress", application.parentAddress],
      ["relation", application.relation],
      ["childFirstName", application.childFirstName],
      ["childLastName", application.childLastName],
      ["childDateOfBirth", application.childDateOfBirth],
      ["requestedProgram", application.requestedProgram],
      ["requestedStartDate", application.requestedStartDate],
      ["emergencyContactName", application.emergencyContactName],
      ["emergencyContactPhone", application.emergencyContactPhone],
      ["emergencyContactRelation", application.emergencyContactRelation],
    ];
    const missing = required
      .filter(([, value]) => value === null || value === undefined || (typeof value === "string" && !value.trim()))
      .map(([key]) => key);
    if (missing.length > 0) {
      throw new BadRequestException(`Application is incomplete: missing ${missing.join(", ")}`);
    }

    const dob = new Date(application.childDateOfBirth);
    if (Number.isNaN(dob.getTime()) || dob >= new Date()) {
      throw new BadRequestException("Child date of birth must be in the past");
    }
    const startDate = new Date(application.requestedStartDate);
    if (Number.isNaN(startDate.getTime()) || startDate < new Date(new Date().toDateString())) {
      throw new BadRequestException("Requested start date cannot be in the past");
    }

    // ---- Resolve classroom (pre-check; re-checked inside transaction) ----
    let classroom: { id: string; name: string; program: string; capacity: number; isActive: boolean };
    if (dto.classroomId) {
      const found = await this.prisma.classroom.findUnique({ where: { id: dto.classroomId } });
      if (!found) throw new NotFoundException("Classroom not found");
      if (!found.isActive) throw new BadRequestException("Classroom is not active");
      if (found.program !== application.requestedProgram) {
        throw new BadRequestException(
          `Classroom program ${found.program} does not match requested program ${application.requestedProgram}`,
        );
      }
      const count = await this.prisma.child.count({
        where: { classroomId: found.id, deletedAt: null, status: "ACTIVE" },
      });
      if (count >= found.capacity) {
        throw new BadRequestException(`Classroom "${found.name}" is at capacity (${found.capacity})`);
      }
      classroom = found;
    } else {
      const candidates = await this.prisma.classroom.findMany({
        where: { program: application.requestedProgram, isActive: true },
        orderBy: { name: "asc" },
      });
      let selected: (typeof candidates)[number] | undefined;
      for (const candidate of candidates) {
        const count = await this.prisma.child.count({
          where: { classroomId: candidate.id, deletedAt: null, status: "ACTIVE" },
        });
        if (count < candidate.capacity) {
          selected = candidate;
          break;
        }
      }
      if (!selected) {
        throw new BadRequestException(
          `No available classroom for program ${application.requestedProgram} — create a classroom or supply classroomId`,
        );
      }
      classroom = selected;
    }

    // ---- Resolve tuition plan ----
    let tuitionPlanId: string | null = null;
    if (dto.tuitionPlanId) {
      const plan = await this.prisma.tuitionPlan.findUnique({ where: { id: dto.tuitionPlanId } });
      if (!plan) throw new BadRequestException("Tuition plan not found");
      if (!plan.isActive) throw new BadRequestException("Tuition plan is not active");
      tuitionPlanId = plan.id;
    } else {
      const plan = await this.prisma.tuitionPlan.findFirst({
        where: { program: application.requestedProgram, isActive: true },
        orderBy: { monthlyAmount: "asc" },
      });
      tuitionPlanId = plan?.id ?? null;
    }

    // ---- Duplicate-child fast check ----
    const duplicateWhere = {
      firstName: application.childFirstName,
      lastName: application.childLastName,
      dateOfBirth: dob,
      deletedAt: null,
      parents: { some: { parent: { user: { email: application.parentEmail } } } },
    };
    const duplicate = await this.prisma.child.findFirst({ where: duplicateWhere });
    if (duplicate) {
      throw new ConflictException("A child with the same name and date of birth is already linked to this parent");
    }

    // ---- Transaction: claim application + create Child/Enrollment + links ----
    // Required documents: the public form intentionally does not upload identity/medical
    // documents (see admissions-form.tsx). Approval therefore validates application
    // completeness only; documents must be collected through the nursery's secure
    // process after approval and must not be emailed in plaintext.
    const result = await this.prisma.$transaction(async (tx) => {
      // Atomically claim the application so concurrent approvals cannot proceed.
      const claim = await tx.enrollmentApplication.updateMany({
        where: { id, status: { not: "APPROVED" } },
        data: {
          status: "APPROVED",
          adminNotes: dto.adminNotes === undefined ? undefined : dto.adminNotes.trim() || null,
          reviewedById: actor.id,
          reviewedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new ConflictException("Enrollment application is already approved — duplicate approval prevented");
      }

      // Serialize approvals for the same parent (existing account). This makes
      // the duplicate re-check below authoritative even across different
      // classrooms. A not-yet-created parent is protected by the User.email
      // unique constraint instead (no row to lock yet).
      await tx.$queryRawUnsafe(`SELECT id FROM "User" WHERE email = $1 FOR UPDATE`, application.parentEmail);

      // Re-check duplicate inside the transaction (authoritative check).
      const duplicateInside = await tx.child.findFirst({ where: duplicateWhere });
      if (duplicateInside) {
        throw new ConflictException("A child with the same name and date of birth is already linked to this parent");
      }

      // Concurrency guard: serialize approvals targeting the same classroom.
      // Without a row lock, two concurrent transactions could both observe
      // count = capacity - 1 and both insert, exceeding capacity.
      await tx.$queryRawUnsafe(
        `SELECT id FROM "Classroom" WHERE id = $1 FOR UPDATE`,
        classroom.id,
      );

      // Re-check capacity inside the transaction (after the lock).
      const countInside = await tx.child.count({
        where: { classroomId: classroom.id, deletedAt: null, status: "ACTIVE" },
      });
      if (countInside >= classroom.capacity) {
        throw new BadRequestException(`Classroom "${classroom.name}" is at capacity (${classroom.capacity})`);
      }

      // Resolve or create parent user/profile.
      let parentId: string;
      let newlyCreatedParent = false;
      let tempPassword: string | null = null;
      const existingUser = await tx.user.findUnique({
        where: { email: application.parentEmail },
        include: { role: true, parentProfile: true },
      });
      if (existingUser) {
        if (existingUser.role.name !== "PARENT") {
          throw new ConflictException(
            `Email ${application.parentEmail} is already registered as ${existingUser.role.name}`,
          );
        }
        if (existingUser.parentProfile) {
          parentId = existingUser.parentProfile.id;
        } else {
          const created = await tx.parent.create({
            data: { userId: existingUser.id, address: application.parentAddress },
          });
          parentId = created.id;
        }
      } else {
        const role = await tx.role.upsert({
          where: { name: "PARENT" },
          update: {},
          create: { name: "PARENT", description: "PARENT role" },
        });
        // 16 random bytes = 128 bits of entropy (base64url ~22 chars + "A1").
        // Ciphertext is stored only as an Argon2id hash; the raw value leaves
        // the service exactly once, in the credentials email below.
        tempPassword = randomBytes(16).toString("base64url") + "A1";
        const passwordHash = await argon2.hash(tempPassword, { type: argon2.argon2id });
        const createdUser = await tx.user.create({
          data: {
            email: application.parentEmail,
            passwordHash,
            firstName: application.parentFirstName,
            lastName: application.parentLastName,
            phone: application.parentPhone,
            roleId: role.id,
            mustChangePassword: true,
          },
        });
        const createdParent = await tx.parent.create({
          data: { userId: createdUser.id, address: application.parentAddress },
        });
        parentId = createdParent.id;
        newlyCreatedParent = true;
      }

      // Create the child.
      const child = await tx.child.create({
        data: {
          firstName: application.childFirstName,
          lastName: application.childLastName,
          dateOfBirth: dob,
          gender: application.childGender,
          classroomId: classroom.id,
          medicalNotes: application.medicalNotes ?? null,
          status: "ACTIVE",
        },
      });

      // Link parent (primary, may pick up).
      await tx.childParent.create({
        data: {
          childId: child.id,
          parentId,
          relation: application.relation,
          isPrimary: true,
          canPickup: true,
        },
      });

      // Preserve allergies as structured Allergy records (splitting free text).
      if (application.allergies?.trim()) {
        const tokens = application.allergies
          .split(/[,;]/)
          .map((token) => token.trim())
          .filter((token) => token.length >= 2)
          .slice(0, 20);
        if (tokens.length > 0) {
          await tx.allergy.createMany({
            data: tokens.map((allergen) => ({ childId: child.id, allergen, severity: "MODERATE" as const })),
          });
        }
      }

      // Create the enrollment record.
      const enrollment = await tx.enrollment.create({
        data: {
          childId: child.id,
          tuitionPlanId,
          program: application.requestedProgram,
          startDate,
          status: "ACTIVE",
        },
      });

      // Outbox events consumed by existing Email/Notification consumers.
      await this.outbox.enqueue(
        "child.enrolled",
        { id: child.id, firstName: child.firstName, lastName: child.lastName, classroomId: child.classroomId },
        tx,
      );
      await this.outbox.enqueue(
        "enrollment.approved",
        {
          id: application.id,
          applicationId: application.id,
          reference: application.reference,
          parentEmail: application.parentEmail,
          parentName: `${application.parentFirstName} ${application.parentLastName}`,
          childName: `${application.childFirstName} ${application.childLastName}`,
          program: application.requestedProgram,
          childId: child.id,
          enrollmentId: enrollment.id,
          parentId,
          classroomId: classroom.id,
          tuitionPlanId,
          adminNotes: dto.adminNotes?.trim() ?? "",
        },
        tx,
      );

      return { childId: child.id, enrollmentId: enrollment.id, parentId, newlyCreatedParent, tempPassword };
    });

    const updated = await this.prisma.enrollmentApplication.findUnique({
      where: { id },
      select: APPLICATION_SELECT,
    });

    await this.audit.log({
      actorId: actor.id,
      action: "enrollment_application.approved",
      entity: "EnrollmentApplication",
      entityId: id,
      metadata: {
        status: "APPROVED",
        childId: result.childId,
        enrollmentId: result.enrollmentId,
        parentId: result.parentId,
        classroomId: classroom.id,
        tuitionPlanId,
      },
    });

    // Parent portal credentials for newly created accounts (approval email via consumers).
    // Failure to send credentials must not undo the approved enrollment itself.
    if (result.newlyCreatedParent && result.tempPassword) {
      try {
        await this.mail.send(
          application.parentEmail,
          "Your Little Steps Nursery parent portal account",
          `Hello ${application.parentFirstName} ${application.parentLastName},\n\nYour enrollment application for ${application.childFirstName} ${application.childLastName} (reference ${application.reference}) has been approved.\n\nYour parent portal account:\nEmail: ${application.parentEmail}\nTemporary password: ${result.tempPassword}\nPlease sign in and change your password immediately.\n\nLittle Steps Nursery`,
        );
      } catch (err) {
        this.logger.error(`Failed to send parent credentials for ${application.reference}: ${(err as Error).message}`);
      }
    }

    return {
      ...(updated ?? application),
      childId: result.childId,
      enrollmentId: result.enrollmentId,
      parentId: result.parentId,
      classroomId: classroom.id,
    };
  }
}
