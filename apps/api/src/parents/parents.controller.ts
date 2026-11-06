import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { IsBoolean } from "class-validator";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { ParentsService } from "./parents.service.js";
import { QueryParentsDto, UpdateParentDto } from "./dto.js";

class SetActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

@ApiTags("parents")
@ApiBearerAuth()
@Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
@Controller("parents")
export class ParentsController {
  constructor(private readonly parents: ParentsService) {}

  @Get()
  list(@Query() query: QueryParentsDto) {
    return this.parents.list(query);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.parents.get(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateParentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.parents.update(id, dto, actor);
  }

  @Get(":id/messages")
  messages(@Param("id") id: string) {
    return this.parents.messages(id);
  }

  @Post(":id/active")
  setActive(@Param("id") id: string, @Body() dto: SetActiveDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.parents.setActive(id, dto.isActive, actor);
  }
}
