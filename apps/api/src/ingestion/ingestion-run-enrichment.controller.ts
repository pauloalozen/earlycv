import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { IngestionService } from "./ingestion.service";

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("ingestion/runs")
export class IngestionRunEnrichmentController {
  constructor(
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
  ) {}

  @Get(":runId/enrichment-summary")
  getEnrichmentSummary(@Param("runId") runId: string) {
    return this.ingestionService.getRunEnrichmentSummary(runId);
  }
}
