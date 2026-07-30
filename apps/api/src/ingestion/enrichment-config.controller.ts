import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
import { ListEnrichmentJobsDto } from "./dto/list-enrichment-jobs.dto";
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { UpdateEnrichmentConfigDto } from "./dto/update-enrichment-config.dto";
import { EnrichmentConfigService } from "./enrichment-config.service";
import { JobEnrichmentWorker } from "./job-enrichment.worker";
import { SemanticFilterAdminService } from "./semantic-filter-admin.service";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

@SkipThrottle()
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("ingestion/enrichment")
export class EnrichmentConfigController {
  constructor(
    @Inject(EnrichmentConfigService)
    private readonly enrichmentConfigService: EnrichmentConfigService,
    @Inject(JobEnrichmentWorker)
    private readonly jobEnrichmentWorker: JobEnrichmentWorker,
    @Inject(SemanticFilterAdminService)
    private readonly semanticFilterAdminService: SemanticFilterAdminService,
  ) {}

  @Get("jobs")
  listJobs(
    @Query(
      new ValidationPipe({
        ...validationOptions,
        expectedType: ListEnrichmentJobsDto,
      }),
    )
    query: ListEnrichmentJobsDto,
  ) {
    return this.semanticFilterAdminService.listJobs(query);
  }

  @Get("config")
  getConfig() {
    return this.enrichmentConfigService.getConfig();
  }

  @Put("config")
  updateConfig(
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    )
    dto: UpdateEnrichmentConfigDto,
  ) {
    return this.enrichmentConfigService.updateConfig(dto);
  }

  @Post("run-now")
  @HttpCode(200)
  async runNow() {
    const processed = await this.jobEnrichmentWorker.runNow();
    return { processed: processed ?? 0 };
  }

  // Processa uma vaga especifica imediatamente, sem depender da posicao
  // dela na fila FIFO do batch generico (ver JobEnrichmentWorker.processOne).
  @Post("jobs/:id/run-now")
  @HttpCode(200)
  async runNowForJob(@Param("id") id: string) {
    return this.jobEnrichmentWorker.processOne(id);
  }
}
