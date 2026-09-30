import { Controller, Get, Inject, Query, Res, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { DashboardAdminService } from "./dashboard-admin.service";

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/dashboard")
export class DashboardAdminController {
  constructor(
    @Inject(DashboardAdminService)
    private readonly dashboardAdminService: DashboardAdminService,
  ) {}

  @Get("overview-stats")
  async getOverviewStats(
    @Res({ passthrough: true }) response: Response,
    @Query("from") fromRaw?: string,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const parsed = fromRaw ? new Date(fromRaw) : null;
    const since =
      parsed && !Number.isNaN(parsed.getTime())
        ? parsed
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    return this.dashboardAdminService.getOverviewStats(since);
  }

  @Get("indexing-log")
  async getIndexingLog(
    @Res({ passthrough: true }) response: Response,
    @Query("limit") limitRaw?: string,
  ) {
    response.setHeader("Cache-Control", "no-store");
    const limit = Math.min(
      200,
      Math.max(1, Number.parseInt(limitRaw ?? "50", 10) || 50),
    );
    return this.dashboardAdminService.getIndexingLog(limit);
  }

  @Get("activity-metrics")
  async getActivityMetrics(
    @Res({ passthrough: true }) response: Response,
    @Query("from") fromRaw?: string,
    @Query("to") toRaw?: string,
  ) {
    response.setHeader("Cache-Control", "no-store");

    const now = new Date();
    const parsedTo = toRaw ? new Date(toRaw) : now;
    const to = Number.isNaN(parsedTo.getTime()) ? now : parsedTo;

    const defaultFrom = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const parsedFrom = fromRaw ? new Date(fromRaw) : defaultFrom;
    let from = Number.isNaN(parsedFrom.getTime()) ? defaultFrom : parsedFrom;

    // Limita a janela a 366 dias pra evitar consultas descontroladas.
    const maxSpanMs = 366 * 24 * 60 * 60 * 1000;
    if (to.getTime() - from.getTime() > maxSpanMs) {
      from = new Date(to.getTime() - maxSpanMs);
    }

    return this.dashboardAdminService.getActivityMetrics(from, to);
  }
}
