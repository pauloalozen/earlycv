import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
// biome-ignore lint/style/useImportType: DTO precisa de import em runtime para reflection do NestJS ValidationPipe
import { UpdateEnrichmentConfigDto } from "./dto/update-enrichment-config.dto";
import { EnrichmentConfigService } from "./enrichment-config.service";
import { JobEnrichmentWorker } from "./job-enrichment.worker";

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
  ) {}

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
}
