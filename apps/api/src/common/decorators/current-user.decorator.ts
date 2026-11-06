import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RoleName } from "../../generated/prisma/enums.js";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
  firstName: string;
  lastName: string;
  parentId?: string | null;
  staffId?: string | null;
  /** True when the account must change its password before using the portal. */
  mustChangePassword?: boolean;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
