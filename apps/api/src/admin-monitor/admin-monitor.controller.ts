import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
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
import { AdminMonitorService } from "./admin-monitor.service";
// Imports de VALOR (não `import type`) de propósito, apesar do biome achar
// que só são usados como tipo: o ValidationPipe global (main.ts) + o local
// por parâmetro dependem dos metadados de decorator (`design:paramtypes`)
// que o TS só emite quando a classe é referenciada como valor em tempo de
// execução. Com `import type` a classe é apagada e o Nest valida contra
// `Object` — resultado, todo parâmetro cai em "property X should not
// exist" mesmo existindo no DTO (bug real encontrado ao testar
// /admin/alerta-vagas: afetava também os endpoints antigos de busca por
// usuário/vaga deste controller — biome converteria de volta pra `import
// type` no autofix se não fosse pelo biome-ignore abaixo).
// biome-ignore-start lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype (ver comentário acima)
import { ListAdminMonitorJobsDto } from "./dto/list-admin-monitor-jobs.dto";
import { ListAdminMonitorRecommendationsDto } from "./dto/list-admin-monitor-recommendations.dto";
import { ListAdminMonitorUsersDto } from "./dto/list-admin-monitor-users.dto";
import { ListDigestHistoryDto } from "./dto/list-digest-history.dto";
import { ListTrackedAlertUsersDto } from "./dto/list-tracked-alert-users.dto";
import { PageQueryDto } from "./dto/page-query.dto";
import { SendDigestNowDto } from "./dto/send-digest-now.dto";
import { TrackAlertUserDto } from "./dto/track-alert-user.dto";
import { UpdateDigestContentDto } from "./dto/update-digest-content.dto";
import { UpdateDigestScheduleDto } from "./dto/update-digest-schedule.dto";

// biome-ignore-end lint/style/useImportType: DTOs de @Query/@Body precisam de import de valor pro Nest reflectir o metatype

const validationOptions = {
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
} as const;

// Ferramenta de DIAGNÓSTICO, não um dashboard executivo — cada rota existe
// pra responder uma pergunta operacional concreta (ver cabeçalho de cada
// método de AdminMonitorService). Nenhuma escrita acontece direto aqui: todo
// POST delega para AdminMonitorService, que por sua vez delega pros services
// reais do Monitor sempre que existem (MonitorEntitlementService,
// MonitorProfileMatchService) — o admin nunca reimplementa regra de negócio.
@UseGuards(JwtAuthGuard, RolesGuard)
@InternalRoles("admin", "superadmin")
@Controller("admin/monitor")
export class AdminMonitorController {
  constructor(
    @Inject(AdminMonitorService)
    private readonly adminMonitorService: AdminMonitorService,
  ) {}

  @Get("overview")
  getOverview() {
    return this.adminMonitorService.getOverview();
  }

  @Get("failures")
  getFailures() {
    return this.adminMonitorService.getFailures();
  }

  @Get("users")
  searchUsers(
    @Query(new ValidationPipe(validationOptions))
    query: ListAdminMonitorUsersDto,
  ) {
    return this.adminMonitorService.searchUsers(query);
  }

  @Get("users/:userId")
  getUserDiagnostic(@Param("userId") userId: string) {
    return this.adminMonitorService.getUserDiagnostic(userId);
  }

  @Get("users/:userId/recommendations")
  listUserRecommendations(
    @Param("userId") userId: string,
    @Query(new ValidationPipe(validationOptions))
    query: ListAdminMonitorRecommendationsDto,
  ) {
    return this.adminMonitorService.listUserRecommendations(userId, query);
  }

  @Get("users/:userId/digests")
  listUserDigests(
    @Param("userId") userId: string,
    @Query(new ValidationPipe(validationOptions)) query: PageQueryDto,
  ) {
    return this.adminMonitorService.listUserDigests(userId, query);
  }

  @Get("users/:userId/attribution")
  getUserAttribution(@Param("userId") userId: string) {
    return this.adminMonitorService.getUserAttribution(userId);
  }

  @Get("recommendations/:id")
  getRecommendationDetail(@Param("id") id: string) {
    return this.adminMonitorService.getRecommendationDetail(id);
  }

  @Get("jobs")
  searchJobs(
    @Query(new ValidationPipe(validationOptions))
    query: ListAdminMonitorJobsDto,
  ) {
    return this.adminMonitorService.searchJobs(query);
  }

  @Get("jobs/:jobId")
  getJobDiagnostic(@Param("jobId") jobId: string) {
    return this.adminMonitorService.getJobDiagnostic(jobId);
  }

  @Post("match-jobs/:id/requeue")
  requeueMatchJob(
    @Param("id") id: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.requeueMatchJob(admin.id, id);
  }

  @Post("profile-match-jobs/:id/requeue")
  requeueProfileMatchJob(
    @Param("id") id: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.requeueProfileMatchJob(admin.id, id);
  }

  @Post("users/:userId/force-rematch")
  forceUserRematch(
    @Param("userId") userId: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.forceUserRematch(admin.id, userId);
  }

  @Post("digests/:id/resend")
  resendDigest(
    @Param("id") id: string,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.resendDigest(admin.id, id);
  }

  // ---------------------------------------------------------------------
  // Alerta de Vagas (/admin/alerta-vagas) — ver
  // docs/specs/2026-09-04-admin-alerta-vagas-tab.md
  // ---------------------------------------------------------------------

  @Get("alert-preference/tracked")
  listTrackedAlertUsers(
    @Query(new ValidationPipe(validationOptions))
    query: ListTrackedAlertUsersDto,
  ) {
    return this.adminMonitorService.listTrackedAlertUsers(query);
  }

  @Post("alert-preference/track")
  trackAlertUser(
    @Body(new ValidationPipe(validationOptions)) body: TrackAlertUserDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.trackAlertUser(admin.id, body.userId);
  }

  @Post("digest/send-now")
  sendDigestNow(
    @Body(new ValidationPipe(validationOptions)) body: SendDigestNowDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.sendDigestNow(admin.id, body.userId);
  }

  @Get("digest/history")
  listDigestHistory(
    @Query(new ValidationPipe(validationOptions)) query: ListDigestHistoryDto,
  ) {
    return this.adminMonitorService.listDigestHistory(query);
  }

  @Get("digest/stats")
  getDigestEmailStats() {
    return this.adminMonitorService.getDigestEmailStats();
  }

  @Get("digest/schedule")
  getDigestSchedule() {
    return this.adminMonitorService.getDigestSchedule();
  }

  @Post("digest/schedule")
  updateDigestSchedule(
    @Body(new ValidationPipe(validationOptions)) body: UpdateDigestScheduleDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.updateDigestSchedule(admin.id, body);
  }

  @Get("digest/content")
  getDigestContent() {
    return this.adminMonitorService.getDigestContent();
  }

  @Post("digest/content")
  updateDigestContent(
    @Body(new ValidationPipe(validationOptions)) body: UpdateDigestContentDto,
    @AuthenticatedUser() admin: AuthenticatedRequestUser,
  ) {
    return this.adminMonitorService.updateDigestContent(admin.id, body);
  }
}
