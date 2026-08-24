import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/google-indexing")
export class GoogleIndexingAdminController {
  constructor(
    @Inject(GoogleIndexingBackfillService)
    private readonly backfillService: GoogleIndexingBackfillService,
  ) {}

  @Get("backfill-status")
  async getBackfillStatus(@Res({ passthrough: true }) response: Response) {
    response.setHeader("Cache-Control", "no-store");
    return this.backfillService.getStatus();
  }
}
