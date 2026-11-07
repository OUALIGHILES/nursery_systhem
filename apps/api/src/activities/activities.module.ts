import {
  Body,
  Controller,
  Delete,
  Get,
  Module,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { AccessService } from "../common/access.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { isStaffRole } from "../common/guards/roles.guard.js";
import { normalizePage, toPage } from "../common/pagination.js";
import type { ParticipationStatus } from "../generated/prisma/enums.js";

const PARTICIPATION: ParticipationStatus[] = ["PARTICIPATED", "PARTIAL", "NOT_PARTICIPATED", "ABSENT"];

export class CreateActivityDto {
  @IsString()
  @Length(2, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsUUID()
  ledByStaffId?: string;
}

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string | null;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  durationMin?: number | null;

  @IsOptional()
  @IsUUID()
  classroomId?: string | null;
}

export class ParticipationDto {
  @IsUUID()
  childId!: string;

  @IsIn(PARTICIPATION)
  status!: ParticipationStatus;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class QueryActivitiesDto {
  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

@Injectable()
class ActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: QueryActivitiesDto, user: AuthenticatedUser) {
    const { skip, take, page, pageSize } = normalizePage(query);
    let classroomFilter: string[] | undefined;
    if (!isStaffRole(user.role)) {
      // Parents: only activities for classrooms of their children
      const ids = await this.access.visibleChildIds(user);
      if (ids.length === 0) return toPage([], 0, page, pageSize);
      const children = await this.prisma.child.findMany({ where: { id: { in: ids } }, select: { classroomId: true } });
      classroomFilter = [...new Set(children.map((c) => c.classroomId).filter((x): x is string => !!x))];
      if (classroomFilter.length === 0) return toPage([], 0, page, pageSize);
    }
    const dateFilter = query.date ? { equals: new Date(query.date) } : undefined;
    const where = {
      ...(query.classroomId ? { classroomId: query.classroomId } : classroomFilter ? { classroomId: { in: classroomFilter } } : {}),
      ...(dateFilter ? { scheduledAt: { gte: startOfDay(dateFilter.equals), lt: new Date(startOfDay(dateFilter.equals).getTime() + 86400_000) } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.activity.findMany({ where, include: { classroom: { select: { id: true, name: true } }, _count: { select: { participations: true } } }, orderBy: { scheduledAt: "desc" }, skip, take }),
      this.prisma.activity.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async get(id: string, user?: AuthenticatedUser) {
    const activity = await this.prisma.activity.findUnique({
      where: { id },
      include: {
        classroom: true,
        participations: { include: { child: { select: { id: true, firstName: true, lastName: true } } } },
      },
    });
    if (!activity) throw new NotFoundException("Activity not found");
    if (user && !isStaffRole(user.role)) {
      const visibleIds = await this.access.visibleChildIds(user);
      const children = await this.prisma.child.findMany({ where: { id: { in: visibleIds } }, select: { classroomId: true } });
      const allowed = new Set(children.map((c) => c.classroomId).filter(Boolean));
      if (!activity.classroomId || !allowed.has(activity.classroomId)) throw new NotFoundException("Activity not found");
    }
    return activity;
  }

  async create(dto: CreateActivityDto, actor: AuthenticatedUser) {
    const activity = await this.prisma.$transaction(async (tx) => {
      const created = await tx.activity.create({
        data: {
          title: dto.title,
          description: dto.description ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          durationMin: dto.durationMin ?? null,
          classroomId: dto.classroomId ?? null,
          ledByStaffId: dto.ledByStaffId ?? null,
          createdById: actor.id,
        },
      });
      await this.outbox.enqueue("activity.created", { id: created.id, title: created.title, classroomId: created.classroomId }, tx);
      return created;
    });
    await this.audit.log({ actorId: actor.id, action: "activity.created", entity: "Activity", entityId: activity.id });
    return activity;
  }

  async update(id: string, dto: UpdateActivityDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Activity not found");
    const activity = await this.prisma.activity.update({
      where: { id },
      data: {
        title: dto.title,
        description: dto.description,
        scheduledAt: dto.scheduledAt === undefined ? undefined : dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        durationMin: dto.durationMin,
        classroomId: dto.classroomId,
      },
    });
    await this.audit.log({ actorId: actor.id, action: "activity.updated", entity: "Activity", entityId: id });
    return activity;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.activity.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Activity not found");
    await this.prisma.activity.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: "activity.deleted", entity: "Activity", entityId: id });
    return { message: "Activity deleted" };
  }

  async recordParticipation(id: string, dto: ParticipationDto, actor: AuthenticatedUser) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException();
    const activity = await this.prisma.activity.findUnique({ where: { id } });
    if (!activity) throw new NotFoundException("Activity not found");
    await this.access.assertChildAccess(actor, dto.childId);
    const participation = await this.prisma.activityParticipation.upsert({
      where: { activityId_childId: { activityId: id, childId: dto.childId } },
      create: { activityId: id, childId: dto.childId, status: dto.status, notes: dto.notes ?? null },
      update: { status: dto.status, notes: dto.notes ?? null },
    });
    return participation;
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@ApiTags("activities")
@ApiBearerAuth()
@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @Get()
  list(@Query() query: QueryActivitiesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.activities.list(query, user);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.activities.get(id, user);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF")
  create(@Body() dto: CreateActivityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.activities.create(dto, actor);
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF")
  update(@Param("id") id: string, @Body() dto: UpdateActivityDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.activities.update(id, dto, actor);
  }

  @Delete(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  remove(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.activities.remove(id, actor);
  }

  @Post(":id/participations")
  recordParticipation(@Param("id") id: string, @Body() dto: ParticipationDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.activities.recordParticipation(id, dto, actor);
  }
}

@Module({
  controllers: [ActivitiesController],
  providers: [ActivitiesService],
  exports: [ActivitiesService],
})
export class ActivitiesModule {}
