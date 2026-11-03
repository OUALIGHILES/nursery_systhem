import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { RoleName } from "../../generated/prisma/enums";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: RoleName;
  firstName: string;
  lastName: string;
  parentId?: string | null;
  staffId?: string | null;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
