import { Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import type { AuthenticatedRequestUser } from "./authenticated-user.decorator";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = AuthenticatedRequestUser>(
    error: unknown,
    user: TUser | false | null,
  ): TUser {
    if (error || !user) {
      throw error instanceof Error ? error : new UnauthorizedException();
    }

    return user;
  }
}
