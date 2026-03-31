import { Controller, Get, Inject, Param, UseGuards } from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { IngestionService } from "./ingestion.service";

@UseGuards(JwtAuthGuard)
@Controller("runs")
export class IngestionController {
  constructor(
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
  ) {}

  @Get()
  list() {
    return this.ingestionService.listAllRuns();
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.ingestionService.getRunById(id);
  }
}
