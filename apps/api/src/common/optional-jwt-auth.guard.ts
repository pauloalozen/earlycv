import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

import type { AuthenticatedRequestUser } from "./authenticated-user.decorator";

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard("jwt") {
  override handleRequest<TUser = AuthenticatedRequestUser>(
    _error: unknown,
    user: TUser | false | null,
  ): TUser | null {
    if (user === false) {
      return null;
    }
    return user;
  }
}
