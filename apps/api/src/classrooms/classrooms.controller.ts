import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { isStaffRole } from "../common/guards/roles.guard.js";
import { ForbiddenException } from "@nestjs/common";
import { ClassroomsService } from "./classrooms.service.js";
import { CreateClassroomDto, UpdateClassroomDto } from "./dto.js";

@ApiTags("classrooms")
@ApiBearerAuth()
@Controller("classrooms")
export class ClassroomsController {
  constructor(private readonly classrooms: ClassroomsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    if (!isStaffRole(user.role) && user.role !== "PARENT") throw new ForbiddenException();
    return this.classrooms.list(user);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    if (!isStaffRole(user.role) && user.role !== "PARENT") throw new ForbiddenException();
    return this.classrooms.get(id, user);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  create(@Body() dto: CreateClassroomDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.classrooms.create(dto, actor);
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  update(@Param("id") id: string, @Body() dto: UpdateClassroomDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.classrooms.update(id, dto, actor);
  }
}
