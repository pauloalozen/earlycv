import { Controller, Get, Inject, Query, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import {
  GoogleIndexingBackfillService,
  type IndexingStatus,
} from "./google-indexing-backfill.service";

const INDEXING_STATUSES: IndexingStatus[] = ["pending", "notified", "failed"];

function parseIndexingStatus(raw: string | undefined): IndexingStatus {
  return INDEXING_STATUSES.includes(raw as IndexingStatus)
    ? (raw as IndexingStatus)
    : "pending";
}

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

  @Get("jobs")
  async listJobs(
    @Res({ passthrough: true }) response: Response,
    @Query("status") statusRaw?: string,
    @Query("page") pageRaw?: string,
    @Query("pageSize") pageSizeRaw?: string,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const status = parseIndexingStatus(statusRaw);
    const page = Math.max(1, Number.parseInt(pageRaw ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number.parseInt(pageSizeRaw ?? "20", 10) || 20),
    );

    return this.backfillService.listJobsByIndexingStatus({
      page,
      pageSize,
      status,
    });
  }
}
