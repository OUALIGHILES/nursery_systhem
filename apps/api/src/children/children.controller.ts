import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator";
import { ChildrenService } from "./children.service";
import { AssignClassroomDto, CreateChildDto, CreatePickupDto, LinkParentDto, QueryChildrenDto, UpdateChildDto } from "./dto";

@ApiTags("children")
@ApiBearerAuth()
@Controller("children")
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

  @Get()
  list(@Query() query: QueryChildrenDto, @CurrentUser() user: AuthenticatedUser) {
    return this.children.list(query, user);
  }

  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.children.get(id, user);
  }

  @Get(":id/profile")
  profile(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.children.profile(id, user);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  create(@Body() dto: CreateChildDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.create(dto, actor);
  }

  @Patch(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  update(@Param("id") id: string, @Body() dto: UpdateChildDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.update(id, dto, actor);
  }

  @Post(":id/archive")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  archive(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.archive(id, actor);
  }

  @Delete(":id")
  @Roles("SUPER_ADMIN", "ADMIN")
  remove(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.remove(id, actor);
  }

  @Post(":id/classroom")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  assignClassroom(@Param("id") id: string, @Body() dto: AssignClassroomDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.assignClassroom(id, dto, actor);
  }

  @Post(":id/parents")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  linkParent(@Param("id") id: string, @Body() dto: LinkParentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.linkParent(id, dto, actor);
  }

  @Delete(":id/parents/:parentId")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  unlinkParent(@Param("id") id: string, @Param("parentId") parentId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.unlinkParent(id, parentId, actor);
  }

  @Post(":id/pickups")
  addPickup(@Param("id") id: string, @Body() dto: CreatePickupDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.addPickup(id, dto, actor);
  }

  @Delete(":id/pickups/:pickupId")
  removePickup(@Param("id") id: string, @Param("pickupId") pickupId: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.children.removePickup(id, pickupId, actor);
  }
}
