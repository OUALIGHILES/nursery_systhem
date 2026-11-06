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
import { Roles } from "../common/decorators/roles.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../common/decorators/current-user.decorator.js";
import { UsersService } from "./users.service.js";
import { CreateUserDto, QueryUsersDto, ResetUserPasswordDto, UpdateUserDto } from "./dto.js";

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  list(@Query() query: QueryUsersDto) {
    return this.users.list(query);
  }

  @Get(":id")
  @Roles("SUPER_ADMIN", "ADMIN", "DIRECTOR")
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post()
  @Roles("SUPER_ADMIN", "ADMIN")
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.create(dto, actor);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.update(id, dto, actor);
  }

  @Post(":id/reset-password")
  @Roles("SUPER_ADMIN", "ADMIN")
  resetPassword(@Param("id") id: string, @Body() dto: ResetUserPasswordDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.adminResetPassword(id, dto.temporaryPassword, actor);
  }

  @Delete(":id")
  @Roles("SUPER_ADMIN", "ADMIN")
  deactivate(@Param("id") id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.users.deactivate(id, actor);
  }
}
