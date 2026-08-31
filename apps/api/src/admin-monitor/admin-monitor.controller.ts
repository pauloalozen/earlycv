import {
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
import type { ListAdminMonitorJobsDto } from "./dto/list-admin-monitor-jobs.dto";
import type { ListAdminMonitorRecommendationsDto } from "./dto/list-admin-monitor-recommendations.dto";
import type { ListAdminMonitorUsersDto } from "./dto/list-admin-monitor-users.dto";
import type { PageQueryDto } from "./dto/page-query.dto";

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
}
