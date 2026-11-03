import {
  Body,
  Controller,
  Delete,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service";
import { AccessService } from "../common/access.service";
import { AuditService } from "../common/audit.service";
import { OutboxService } from "../kafka/outbox.service";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { isStaffRole } from "../common/guards/roles.guard";
import { ForbiddenException } from "@nestjs/common";
import type { AllergySeverity, IncidentSeverity } from "../generated/prisma/enums";

const SEVERITIES: AllergySeverity[] = ["MILD", "MODERATE", "SEVERE"];
const INCIDENT_SEVERITIES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export class CreateAllergyDto {
  @IsUUID()
  childId!: string;

  @IsString()
  @Length(2, 160)
  allergen!: string;

  @IsIn(SEVERITIES)
  severity!: AllergySeverity;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateMedicationDto {
  @IsUUID()
  childId!: string;

  @IsString()
  @Length(2, 160)
  medication!: string;

  @IsString()
  @Length(1, 120)
  dosage!: string;

  @IsOptional()
  @IsDateString()
  administeredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateIncidentDto {
  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsString()
  @Length(2, 160)
  type!: string;

  @IsString()
  @Length(5, 4000)
  description!: string;

  @IsIn(INCIDENT_SEVERITIES)
  severity!: IncidentSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  actionTaken?: string;

  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}

export class UpdateIncidentDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  actionTaken?: string;

  @IsOptional()
  @IsBoolean()
  parentNotified?: boolean;

  @IsOptional()
  @IsIn(INCIDENT_SEVERITIES)
  severity?: IncidentSeverity;
}

@Injectable()
class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listAllergies(childId: string, user: AuthenticatedUser) {
    await this.access.assertChildAccess(user, childId);
    return this.prisma.allergy.findMany({ where: { childId }, orderBy: { createdAt: "desc" } });
  }

  async addAllergy(dto: CreateAllergyDto, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    await this.access.assertChildAccess(actor, dto.childId);
    const allergy = await this.prisma.allergy.create({ data: { childId: dto.childId, allergen: dto.allergen, severity: dto.severity, notes: dto.notes ?? null } });
    await this.audit.log({ actorId: actor.id, action: "health.allergy_added", entity: "Allergy", entityId: allergy.id });
    return allergy;
  }

  async removeAllergy(id: string, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    const existing = await this.prisma.allergy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Allergy not found");
    await this.access.assertChildAccess(actor, existing.childId);
    await this.prisma.allergy.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: "health.allergy_removed", entity: "Allergy", entityId: id });
    return { message: "Allergy removed" };
  }

  async listMedications(childId: string, user: AuthenticatedUser) {
    await this.access.assertChildAccess(user, childId);
    return this.prisma.medicationRecord.findMany({
      where: { childId },
      include: { administeredBy: { select: { firstName: true, lastName: true } } },
      orderBy: { administeredAt: "desc" },
      take: 100,
    });
  }

  async addMedication(dto: CreateMedicationDto, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    await this.access.assertChildAccess(actor, dto.childId);
    const record = await this.prisma.medicationRecord.create({
      data: {
        childId: dto.childId,
        medication: dto.medication,
        dosage: dto.dosage,
        administeredAt: dto.administeredAt ? new Date(dto.administeredAt) : new Date(),
        administeredById: actor.id,
        notes: dto.notes ?? null,
      },
    });
    await this.audit.log({ actorId: actor.id, action: "health.medication_administered", entity: "MedicationRecord", entityId: record.id });
    return record;
  }

  async listIncidents(user: AuthenticatedUser, childId?: string) {
    const visibleIds = await this.access.visibleChildIds(user);
    const where = childId
      ? { childId: { in: visibleIds.includes(childId) ? [childId] : [] } }
      : isStaffRole(user.role)
        ? {}
        : { childId: { in: visibleIds } };
    return this.prisma.incident.findMany({
      where,
      include: {
        child: { select: { id: true, firstName: true, lastName: true } },
        classroom: { select: { id: true, name: true } },
        reportedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { occurredAt: "desc" },
      take: 100,
    });
  }

  async reportIncident(dto: CreateIncidentDto, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    const incident = await this.prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          childId: dto.childId ?? null,
          classroomId: dto.classroomId ?? null,
          reportedById: actor.id,
          type: dto.type,
          description: dto.description,
          severity: dto.severity,
          actionTaken: dto.actionTaken ?? null,
          occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        },
      });
      if (dto.childId) {
        const links = await tx.childParent.findMany({ where: { childId: dto.childId }, select: { parent: { select: { userId: true } } } });
        await this.outbox.enqueue(
          "incident.reported",
          { id: created.id, childId: dto.childId, severity: created.severity, type: created.type, description: created.description, parentUserIds: links.map((l) => l.parent.userId) },
          tx,
        );
      }
      return created;
    });
    await this.audit.log({ actorId: actor.id, action: "health.incident_reported", entity: "Incident", entityId: incident.id });
    return incident;
  }

  async updateIncident(id: string, dto: UpdateIncidentDto, actor: AuthenticatedUser) {
    this.assertStaff(actor);
    const existing = await this.prisma.incident.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Incident not found");
    const incident = await this.prisma.incident.update({ where: { id }, data: { actionTaken: dto.actionTaken, parentNotified: dto.parentNotified, severity: dto.severity } });
    await this.audit.log({ actorId: actor.id, action: "health.incident_updated", entity: "Incident", entityId: id });
    return incident;
  }

  private assertStaff(user: AuthenticatedUser) {
    if (!isStaffRole(user.role)) throw new ForbiddenException("Only staff can modify health records");
  }
}

@ApiTags("health")
@ApiBearerAuth()
@Controller("health")
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get("allergies")
  listAllergies(@Query("childId") childId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.health.listAllergies(childId, user);
  }

  @Post("allergies")
  addAllergy(@Body() dto: CreateAllergyDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.health.addAllergy(dto, actor);
  }

  @Delete("allergies/:id")
  removeAllergy(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.health.removeAllergy(id, actor);
  }

  @Get("medications")
  listMedications(@Query("childId") childId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.health.listMedications(childId, user);
  }

  @Post("medications")
  addMedication(@Body() dto: CreateMedicationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.health.addMedication(dto, actor);
  }

  @Get("incidents")
  listIncidents(@Query("childId") childId: string | undefined, @CurrentUser() user: AuthenticatedUser) {
    return this.health.listIncidents(user, childId);
  }

  @Post("incidents")
  reportIncident(@Body() dto: CreateIncidentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.health.reportIncident(dto, actor);
  }

  @Patch("incidents/:id")
  updateIncident(@Param("id") id: string, @Body() dto: UpdateIncidentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.health.updateIncident(id, dto, actor);
  }
}

@Module({
  controllers: [HealthController],
  providers: [HealthService],
  exports: [HealthService],
})
export class HealthModule {}
