import {
  Body,
  Controller,
  Delete,
  Get,
  ForbiddenException,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../prisma/prisma.service.js";
import { AccessService } from "../common/access.service.js";
import { AuditService } from "../common/audit.service.js";
import { OutboxService } from "../kafka/outbox.service.js";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { isStaffRole } from "../common/guards/roles.guard.js";
import { normalizePage, toPage } from "../common/pagination.js";
import type { ConsumptionLevel, MealType } from "../generated/prisma/enums.js";

const MEAL_TYPES: MealType[] = ["BREAKFAST", "LUNCH", "SNACK_MORNING", "SNACK_AFTERNOON"];
const CONSUMPTION: ConsumptionLevel[] = ["ALL", "PARTIAL", "NONE"];

export class CreateMealDto {
  @IsDateString()
  date!: string;

  @IsIn(MEAL_TYPES)
  mealType!: MealType;

  @IsString()
  @Length(2, 160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allergens?: string[];

  @IsOptional()
  @IsUUID()
  classroomId?: string;
}

export class UpdateMealDto {
  @IsOptional()
  @IsString()
  @Length(2, 160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allergens?: string[];
}

export class MealRecordDto {
  @IsUUID()
  childId!: string;

  @IsIn(CONSUMPTION)
  consumption!: ConsumptionLevel;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class QueryMealsDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsUUID()
  classroomId?: string;

  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;
}

@Injectable()
class MealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async list(query: QueryMealsDto, user?: AuthenticatedUser) {
    const { skip, take, page, pageSize } = normalizePage(query);
    let classroomFilter: string[] | undefined;
    if (user) {
      const visibleIds = await this.access.visibleChildIds(user);
      if (visibleIds.length === 0) return toPage([], 0, page, pageSize);
      const children = await this.prisma.child.findMany({ where: { id: { in: visibleIds } }, select: { classroomId: true } });
      classroomFilter = [...new Set(children.map((c) => c.classroomId).filter((x): x is string => !!x))];
      if (classroomFilter.length === 0) return toPage([], 0, page, pageSize);
      if (user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "DIRECTOR") classroomFilter = undefined;
    }
    const where = {
      ...(query.date ? { date: startOfDay(new Date(query.date)) } : {}),
      ...(query.classroomId ? { classroomId: query.classroomId } : classroomFilter ? { classroomId: { in: classroomFilter } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.meal.findMany({ where, orderBy: [{ date: "desc" }, { mealType: "asc" }], skip, take }),
      this.prisma.meal.count({ where }),
    ]);
    return toPage(items, total, page, pageSize);
  }

  async create(dto: CreateMealDto, actor: AuthenticatedUser) {
    const meal = await this.prisma.meal.create({
      data: {
        date: startOfDay(new Date(dto.date)),
        mealType: dto.mealType,
        name: dto.name,
        description: dto.description ?? null,
        allergens: dto.allergens ?? [],
        classroomId: dto.classroomId ?? null,
      },
    });
    await this.audit.log({ actorId: actor.id, action: "meal.created", entity: "Meal", entityId: meal.id });
    return meal;
  }

  async update(id: string, dto: UpdateMealDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.meal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Meal not found");
    const meal = await this.prisma.meal.update({
      where: { id },
      data: { name: dto.name, description: dto.description, allergens: dto.allergens },
    });
    await this.audit.log({ actorId: actor.id, action: "meal.updated", entity: "Meal", entityId: id });
    return meal;
  }

  async remove(id: string, actor: AuthenticatedUser) {
    const existing = await this.prisma.meal.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Meal not found");
    await this.prisma.meal.delete({ where: { id } });
    await this.audit.log({ actorId: actor.id, action: "meal.deleted", entity: "Meal", entityId: id });
    return { message: "Meal deleted" };
  }

  async recordConsumption(mealId: string, dto: MealRecordDto, actor: AuthenticatedUser) {
    if (!isStaffRole(actor.role)) throw new ForbiddenException("Only staff can record meals");
    const meal = await this.prisma.meal.findUnique({ where: { id: mealId } });
    if (!meal) throw new NotFoundException("Meal not found");
    await this.access.assertChildAccess(actor, dto.childId);
    const record = await this.prisma.mealRecord.upsert({
      where: { mealId_childId: { mealId, childId: dto.childId } },
      create: { mealId, childId: dto.childId, consumption: dto.consumption, notes: dto.notes ?? null },
      update: { consumption: dto.consumption, notes: dto.notes ?? null },
    });
    await this.outbox.enqueue("meal.recorded", { id: record.id, mealId, childId: dto.childId, mealType: meal.mealType, consumption: dto.consumption });
    return record;
  }

  async records(mealId: string, user?: AuthenticatedUser) {
    const meal = await this.prisma.meal.findUnique({ where: { id: mealId } });
    if (!meal) throw new NotFoundException("Meal not found");
    if (user) {
      const visibleIds = await this.access.visibleChildIds(user);
      const children = await this.prisma.child.findMany({ where: { id: { in: visibleIds } }, select: { classroomId: true } });
      const allowed = new Set(children.map((c) => c.classroomId).filter(Boolean));
      const isAdmin = user.role === "SUPER_ADMIN" || user.role === "ADMIN" || user.role === "DIRECTOR";
      if (!isAdmin) {
        if (!meal.classroomId || !allowed.has(meal.classroomId)) throw new NotFoundException("Meal not found");
      }
    }
    return this.prisma.mealRecord.findMany({
      where: { mealId },
      include: { child: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async childHistory(childId: string, user: AuthenticatedUser) {
    await this.access.assertChildAccess(user, childId);
    const records = await this.prisma.mealRecord.findMany({
      where: { childId },
      include: { meal: true },
      orderBy: { meal: { date: "desc" } },
      take: 60,
    });
    return records.map((r) => ({
      id: r.id,
      consumption: r.consumption,
      notes: r.notes,
      meal: { id: r.meal.id, date: r.meal.date, mealType: r.meal.mealType, name: r.meal.name, allergens: r.meal.allergens },
    }));
  }
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

@ApiTags("meals")
@ApiBearerAuth()
@Controller("meals")
export class MealsController {
  constructor(private readonly meals: MealsService) {}

  @Get()
  list(@Query() query: QueryMealsDto, @CurrentUser() user: AuthenticatedUser) {
    return this.meals.list(query, user);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF")
  create(@Body() dto: CreateMealDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.meals.create(dto, actor);
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF")
  update(@Param("id") id: string, @Body() dto: UpdateMealDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.meals.update(id, dto, actor);
  }

  @Delete(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  remove(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.meals.remove(id, actor);
  }

  @Post(":id/records")
  recordConsumption(@Param("id") id: string, @Body() dto: MealRecordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.meals.recordConsumption(id, dto, actor);
  }

  @Get(":id/records")
  records(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.meals.records(id, user);
  }

  @Get("child/:childId")
  childHistory(@Param("childId") childId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.meals.childHistory(childId, user);
  }
}

@Module({
  controllers: [MealsController],
  providers: [MealsService],
  exports: [MealsService],
})
export class MealsModule {}
