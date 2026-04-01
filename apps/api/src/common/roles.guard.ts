import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { INTERNAL_ROLES_KEY, type InternalRole } from "./roles.decorator";

type RequestUser = {
  isStaff: boolean;
  internalRole: "none" | InternalRole;
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector()) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<InternalRole[]>(
      INTERNAL_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: RequestUser }>();
    const internalRole = request.user?.internalRole;

    if (
      !request.user?.isStaff ||
      internalRole === "none" ||
      !internalRole ||
      !requiredRoles.includes(internalRole)
    ) {
      throw new ForbiddenException("insufficient internal role");
    }

    return true;
  }
}
