import { Controller, Get, Inject, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("ingestion/job-sources")
export class JobSourceExportController {
  constructor(
    @Inject(AdminIngestionImportService)
    private readonly importService: AdminIngestionImportService,
  ) {}

  @Get("export-csv")
  async exportCsv(@Res() res: Response) {
    const csv = await this.importService.exportCompanySourcesCsv();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="job-sources-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csv);
  }
}
