import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator";
import type { RoleName } from "../../generated/prisma/enums";
import type { AuthenticatedUser } from "../decorators/current-user.decorator";

const STAFF_ROLES: RoleName[] = ["SUPER_ADMIN", "ADMIN", "DIRECTOR", "TEACHER", "STAFF"];
export const isStaffRole = (role: RoleName) => STAFF_ROLES.includes(role);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    if (!user) throw new ForbiddenException("Access denied");
    if (!required.includes(user.role)) {
      throw new ForbiddenException("Insufficient permissions for this resource");
    }
    return true;
  }
}
