import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { JobReviewService } from "./job-review.service";

// /admin/vagas-em-revisao: vagas em pending_review e as ações de revisão.
@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/job-review")
export class JobReviewAdminController {
  constructor(
    @Inject(JobReviewService)
    private readonly jobReviewService: JobReviewService,
  ) {}

  @Get("jobs")
  async listPending(
    @Res({ passthrough: true }) response: Response,
    @Query("page") pageRaw?: string,
    @Query("pageSize") pageSizeRaw?: string,
  ) {
    response.setHeader("Cache-Control", "no-store");
    return this.jobReviewService.listPending({
      page: Number.parseInt(pageRaw ?? "1", 10) || 1,
      pageSize: Number.parseInt(pageSizeRaw ?? "20", 10) || 20,
    });
  }

  @Post("jobs/:jobId/approve")
  approve(@Param("jobId") jobId: string) {
    return this.jobReviewService.approve(jobId);
  }

  @Post("jobs/:jobId/reject")
  reject(@Param("jobId") jobId: string) {
    return this.jobReviewService.reject(jobId);
  }
}
