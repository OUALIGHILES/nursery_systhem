import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { StaffService } from "./staff.service.js";
import { AssignClassroomStaffDto, QueryStaffDto, UpdateStaffDto } from "./dto.js";

@ApiTags("staff")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
@Controller("staff")
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@Query() query: QueryStaffDto) {
    return this.staff.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.staff.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateStaffDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.staff.update(id, dto, actor);
  }

  @Post(":id/classrooms")
  assignClassroom(@Param("id") id: string, @Body() dto: AssignClassroomStaffDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.staff.assignClassroom(id, dto, actor);
  }

  @Delete(":id/classrooms/:classroomId")
  unassignClassroom(@Param("id") id: string, @Param("classroomId") classroomId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.staff.unassignClassroom(id, classroomId, actor);
  }
}
