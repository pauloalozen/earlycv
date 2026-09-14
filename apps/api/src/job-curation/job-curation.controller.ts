import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { RolesGuard } from "../common/roles.guard";
// Imports de VALOR de propósito (não `import type`) — ver comentário em
// AdminMonitorController sobre o bug de ValidationPipe global com `import
// type` em DTOs de @Query/@Body.
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { GetCurationCountersDto } from "./dto/get-curation-counters.dto";
import { ListCurationJobsDto } from "./dto/list-curation-jobs.dto";
import { UpdateCurationStatusDto } from "./dto/update-curation-status.dto";
// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype
import { JobCurationService } from "./job-curation.service";

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

// Backend de /admin/curadoria-vagas — curadoria manual de vagas capturadas
// recentemente pra escolher o que divulgar no dia (ver docs do plano
// aprovado). Só leitura de Job/JobEnrichment + CRUD do próprio registro de
// curadoria; nunca toca em fit, matching ou taxonomia.
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("job-curation")
export class JobCurationController {
  constructor(
    @Inject(JobCurationService)
    private readonly jobCurationService: JobCurationService,
  ) {}

  @Get("jobs")
  listJobs(
    @Query(new ValidationPipe(validationOptions)) query: ListCurationJobsDto,
  ) {
    return this.jobCurationService.listJobs(query);
  }

  @Get("counters/seniority")
  getSeniorityCounters(
    @Query(new ValidationPipe(validationOptions))
    query: GetCurationCountersDto,
  ) {
    return this.jobCurationService.getSeniorityCounters(query);
  }

  @Put("jobs/:jobId")
  setCurationStatus(
    @Param("jobId") jobId: string,
    @Body(new ValidationPipe(validationOptions)) body: UpdateCurationStatusDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.jobCurationService.setCurationStatus(jobId, body, admin.id);
  }
}
