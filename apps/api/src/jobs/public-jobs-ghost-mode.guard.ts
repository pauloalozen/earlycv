import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Response } from "express";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { APP_ENV, type AppEnv } from "../config/env.module";

@Injectable()
export class PublicJobsGhostModeGuard implements CanActivate {
  constructor(
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Inject(JwtAuthGuard) private readonly jwtAuthGuard: JwtAuthGuard,
    @Inject(RolesGuard) private readonly rolesGuard: RolesGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.env.JOBS_GHOST_MODE) {
      return true;
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Robots-Tag", "noindex, nofollow");

    try {
      await this.jwtAuthGuard.canActivate(context);
      this.rolesGuard.canActivate(context);
      return true;
    } catch {
      throw new NotFoundException("job not found");
    }
  }
}
