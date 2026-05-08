import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import type { CvUnlockSource, CvUnlockStatus } from "@prisma/client";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { CvUnlocksService } from "./cv-unlocks.service";

@Controller("cv-unlocks")
@UseGuards(JwtAuthGuard)
export class CvUnlocksController {
  constructor(
    @Inject(CvUnlocksService)
    private readonly cvUnlocksService: CvUnlocksService,
  ) {}

  @Get("admin/list")
  @UseGuards(RolesGuard)
  @InternalRoles("superadmin")
  listAdminUnlocks(
    @Query("email") email?: string,
    @Query("userId") userId?: string,
    @Query("cvAdaptationId") cvAdaptationId?: string,
    @Query("source") source?: CvUnlockSource,
    @Query("status") status?: CvUnlockStatus,
    @Query("dateFrom") dateFrom?: string,
    @Query("dateTo") dateTo?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.cvUnlocksService.listAdminUnlocks({
      email,
      userId,
      cvAdaptationId,
      source,
      status,
      dateFrom,
      dateTo,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
