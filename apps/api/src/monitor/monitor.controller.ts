import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Put,
  Query,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { UpdateRadarProfileDto } from "../radar/dto/update-radar-profile.dto";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { RecommendationFeedbackDto } from "./dto/recommendation-feedback.dto";
import { UpdateAlertPreferenceDto } from "./dto/update-alert-preference.dto";
import { MonitorAlertPreferenceService } from "./monitor-alert-preference.service";
import { MonitorEntitlementGuard } from "./monitor-entitlement.guard";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { MonitorProfileMatchService } from "./monitor-profile-match.service";
import { MonitorRecommendationsService } from "./monitor-recommendations.service";

// Módulo próprio do Meu Monitor — deliberadamente não estende
// PublicJobsController (guest-first, com lógica de ghost-mode/SEO que não
// se aplica aqui). Toda rota exige usuário autenticado; GET /monitor NUNCA
// funciona como uma variante de GET /public/jobs — consulta
// UserJobRecommendation, o feed já persistido pelo MonitorMatchingWorker
// (ver ADENDO DE PRODUTO da spec do Monitor). MonitorEntitlementGuard vem
// DEPOIS de JwtAuthGuard (ordem importa) — único ponto de enforcement de
// acesso ao Monitor nos endpoints HTTP; hoje libera todo mundo (política
// de lançamento), ver MonitorEntitlementService.
// Limite global do ThrottlerGuard (60 req/min/IP, ver app.module.ts) é
// baixo demais pra esta tela: cada seção do Meu Monitor pagina de forma
// independente (ver MonitorLevelSection) e paginar até o fim de uma lista
// grande (ex.: 165 vagas) facilmente passa de 60 requisições dentro de um
// minuto, o que fazia GET /monitor devolver 429 no meio da navegação —
// indistinguível pro frontend de um erro real (ver listMonitorRecommendations
// em monitor-api.ts, que trata !response.ok como feed vazio).
@Throttle({ default: { ttl: 60_000, limit: 300 } })
@UseGuards(JwtAuthGuard, MonitorEntitlementGuard)
@Controller("monitor")
export class MonitorController {
  constructor(
    @Inject(MonitorRecommendationsService)
    private readonly recommendationsService: MonitorRecommendationsService,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(MonitorProfileMatchService)
    private readonly monitorProfileMatchService: MonitorProfileMatchService,
    @Inject(MonitorAlertPreferenceService)
    private readonly alertPreferenceService: MonitorAlertPreferenceService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  @Get()
  list(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("includeDismissed") includeDismissedRaw?: string,
    @Query("level") level?: string,
    @Query("sort") sort?: string,
  ) {
    const opportunityLevel = level ? Number.parseInt(level, 10) : undefined;
    return this.recommendationsService.list(user.id, {
      page: page ? Number.parseInt(page, 10) : undefined,
      limit: limit ? Number.parseInt(limit, 10) : undefined,
      includeDismissed: includeDismissedRaw === "true",
      opportunityLevel:
        opportunityLevel !== undefined && !Number.isNaN(opportunityLevel)
          ? opportunityLevel
          : undefined,
      sort: sort === "recent" ? "recent" : "score",
    });
  }

  @Get("count")
  count(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.recommendationsService.countUnviewed(user.id);
  }

  // Contagem por nível de oportunidade — a UI busca isso uma vez pra saber
  // quais seções renderizar antes de paginar cada uma independentemente.
  @Get("level-counts")
  levelCounts(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.recommendationsService.countByLevel(user.id);
  }

  // Alias sobre UserRadarProfileService — o Monitor sempre opera sobre
  // UserRadarProfile, nunca sobre um perfil próprio (decisão explícita da
  // spec: não criar outro perfil).
  @Get("profile")
  getProfile(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.userRadarProfileService.getProfile(user.id);
  }

  @Put("profile")
  async updateProfile(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: UpdateRadarProfileDto,
      }),
    )
    dto: UpdateRadarProfileDto,
  ) {
    await this.userRadarProfileService.updateProfile(user.id, dto);

    // A decisão de "isso é relevante o bastante pra reprocessar" não é
    // tomada aqui — enqueueRematch compara o fingerprint dos campos que
    // MatchingEngine.calculateScore realmente usa e só enfileira trabalho
    // quando algo relevante mudou de fato (ver monitor-profile-match.service.ts).
    await this.monitorProfileMatchService.enqueueRematch(user.id);

    // Relido após enqueueRematch pra devolver monitorStatus já refletindo
    // se um rematch foi de fato enfileirado (REFRESHING) ou não.
    const updated = await this.userRadarProfileService.getProfile(user.id);

    const { reason: accessType } = await this.entitlementService.canUseMonitor(
      user.id,
    );
    await this.funnelEvents
      .record(
        {
          eventName: "monitor_profile_updated",
          eventVersion: 1,
          metadata: {
            product_origin: "monitor",
            monitor_access_type: accessType,
          },
        },
        {
          correlationId: `monitor-profile:${user.id}`,
          ip: null,
          requestId: `monitor-profile:${user.id}:${Date.now()}`,
          routePath: "/api/monitor/profile",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId: user.id,
        },
        "backend",
      )
      .catch(() => {
        // best-effort — a resposta já reflete o estado final do perfil.
      });

    return updated;
  }

  // Seção "Alertas" dentro do Meu Monitor — preferência de comunicação,
  // conceito distinto de UserRadarProfile (que é O QUE monitorar, não
  // COMO avisar). GET faz self-heal (default DAILY+enabled) igual ao
  // padrão já usado pelo perfil de matching.
  @Get("alert-preferences")
  getAlertPreferences(@AuthenticatedUser() user: AuthenticatedRequestUser) {
    return this.alertPreferenceService.getOrCreate(user.id);
  }

  @Put("alert-preferences")
  updateAlertPreferences(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: UpdateAlertPreferenceDto,
      }),
    )
    dto: UpdateAlertPreferenceDto,
  ) {
    return this.alertPreferenceService.update(user.id, dto);
  }

  @Patch(":id/viewed")
  markViewed(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.recommendationsService.markViewed(user.id, id);
  }

  @Patch(":id/dismiss")
  dismiss(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
  ) {
    return this.recommendationsService.dismiss(user.id, id);
  }

  @Patch(":id/feedback")
  feedback(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        expectedType: RecommendationFeedbackDto,
      }),
    )
    dto: RecommendationFeedbackDto,
  ) {
    return this.recommendationsService.submitFeedback(
      user.id,
      id,
      dto.feedback,
      dto.feedbackReason,
    );
  }
}
