import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";

import {
  type AuthenticatedRequestUser,
  AuthenticatedUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../common/optional-jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { JobApplicationsService } from "../job-applications/job-applications.service";
import { MatchingEngine } from "../radar/matching.engine";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { SavedJobsService } from "../saved-jobs/saved-jobs.service";
import { JobsService } from "./jobs.service";
import { toPublicJobView } from "./public-job-view";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

@Controller("public/jobs")
export class PublicJobsController {
  constructor(
    @Inject(JobsService) private readonly jobsService: JobsService,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
    @Inject(JobApplicationsService)
    private readonly jobApplicationsService: JobApplicationsService,
    @Inject(SavedJobsService)
    private readonly savedJobsService: SavedJobsService,
  ) {}

  @Get()
  @InternalRoles("admin", "superadmin")
  // PublicJobsGhostModeGuard, sozinho, só roda o JwtAuthGuard quando o ghost
  // mode está ligado — com ghost mode desligado ele libera o acesso sem
  // nunca tentar identificar quem está logado, então @AuthenticatedUser()
  // nunca é preenchido e o score personalizado nunca aparece. O
  // OptionalJwtAuthGuard garante que a identidade é sempre tentada,
  // independente do estado do ghost mode, sem bloquear quem não tem token.
  @UseGuards(PublicJobsGhostModeGuard, OptionalJwtAuthGuard)
  async list(
    @Req() _request: Request,
    @AuthenticatedUser() user: AuthenticatedRequestUser | undefined,
    @Query("q") q?: string,
    @Query("workModel") workModel?: string,
    @Query("seniorityLevel") seniorityLevel?: string,
    @Query("companyName") companyName?: string,
    @Query("publishedWithin") publishedWithin?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("minScore") minScoreRaw?: string,
    @Query("minSkillsPct") minSkillsPctRaw?: string,
    @Query("sort") sort?: string,
    @Query("excludeAnalyzed") excludeAnalyzedRaw?: string,
  ) {
    const validPublishedWithin = ["24h", "3d", "7d"].includes(
      publishedWithin ?? "",
    )
      ? (publishedWithin as "24h" | "3d" | "7d")
      : undefined;
    const minScore = minScoreRaw ? Number.parseInt(minScoreRaw, 10) : undefined;
    const minSkillsPct = minSkillsPctRaw
      ? Number.parseInt(minSkillsPctRaw, 10)
      : undefined;
    const excludeAnalyzed = excludeAnalyzedRaw === "true";

    const parsedPage = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
    const parsedLimit = Math.min(
      100,
      Math.max(1, Number.parseInt(limit ?? "20", 10) || 20),
    );
    const filters = {
      q,
      workModel,
      seniorityLevel,
      companyName,
      publishedWithin: validPublishedWithin,
    };

    const radarProfile = user
      ? await this.userRadarProfileService.getProfile(user.id)
      : null;

    if (!user || !radarProfile) {
      const { jobs, total } = await this.jobsService.listPublicFiltered({
        ...filters,
        page: parsedPage,
        limit: parsedLimit,
      });

      // isSaved independe de radarProfile — um usuário sem CV master ainda
      // pode ter salvo vagas pra depois.
      const savedJobIds = user
        ? await this.savedJobsService.listSavedJobIds(
            user.id,
            jobs.map((job) => job.id),
          )
        : new Set<string>();

      return {
        data: jobs.map((job) => ({
          ...toPublicJobView(job),
          isSaved: savedJobIds.has(job.id),
        })),
        total,
        page: parsedPage,
        limit: parsedLimit,
      };
    }

    // Usuário logado com UserRadarProfile: o Radar prioriza por relevância,
    // mas nunca esconde vagas — traz o mesmo conjunto que o anônimo veria
    // (mesmos filtros de texto/empresa/data) e ordena por score DESC
    // (vagas ainda sem enrichment COMPLETED, sem score, vão por último,
    // desempatadas por lastSeenAt DESC como no anônimo).
    const jobsWithEnrichment = await this.jobsService.listByIdsWithEnrichment(
      null,
      filters,
    );

    const scoredAll = jobsWithEnrichment
      .map((job) => {
        const enrichment = job.enrichment;
        if (!enrichment || enrichment.enrichmentStatus !== "COMPLETED") {
          return { job, match: null, skillsPct: null };
        }
        const match = this.matchingEngine.calculateScore(
          {
            jobId: job.id,
            workModel: job.workModel,
            dominantArea: enrichment.dominantArea,
            areas: enrichment.areas,
            requiredSkills: enrichment.requiredSkills,
            technologies: enrichment.technologies,
            seniority: enrichment.seniority,
            languageRequirements: enrichment.languageRequirements,
          },
          {
            areas: radarProfile.areas,
            skills: radarProfile.skills,
            technologies: radarProfile.technologies,
            seniority: radarProfile.seniority,
            languages: radarProfile.languages,
            preferredWorkModels: radarProfile.preferredWorkModels,
          },
        );
        const totalSkills =
          match.matchedSkills.length + match.missingSkills.length;
        const skillsPct =
          totalSkills > 0
            ? Math.round((match.matchedSkills.length / totalSkills) * 100)
            : 100;
        return { job, match, skillsPct };
      })
      .sort((a, b) => {
        if (sort === "date_asc") {
          return a.job.lastSeenAt.getTime() - b.job.lastSeenAt.getTime();
        }
        if (sort === "date_desc") {
          return b.job.lastSeenAt.getTime() - a.job.lastSeenAt.getTime();
        }
        // score_asc/score_desc (e default): vagas sem score calculável vão
        // sempre por último, nas duas direções — não representam "0%", e
        // sim "ainda não avaliado".
        const aScore = a.match?.score ?? null;
        const bScore = b.match?.score ?? null;
        if (aScore === null && bScore === null) {
          return b.job.lastSeenAt.getTime() - a.job.lastSeenAt.getTime();
        }
        if (aScore === null) return 1;
        if (bScore === null) return -1;
        if (bScore !== aScore) {
          return sort === "score_asc" ? aScore - bScore : bScore - aScore;
        }
        return b.job.lastSeenAt.getTime() - a.job.lastSeenAt.getTime();
      });

    const highCompatCount = scoredAll.filter(
      (item) => (item.match?.score ?? 0) >= 70,
    ).length;

    // Resolvido pra todo o conjunto filtrado (não só a página) porque
    // excludeAnalyzed precisa decidir quem entra na paginação antes de
    // fatiar — filtrar só a página deixaria passar vagas já analisadas que
    // deveriam ter sido removidas do total/paginação.
    const bestScores = await this.jobApplicationsService.getBestScoresByJobIds(
      user.id,
      scoredAll.map(({ job }) => job.id),
    );

    // minScore/minSkillsPct só existem quando o usuário ativa o filtro
    // explicitamente (Radar nunca esconde vaga por conta própria por
    // padrão) — vagas sem score calculável nunca passam nesses filtros.
    // excludeAnalyzed é o único filtro do Radar que vem ligado por padrão no
    // front (checkbox pré-marcado) — aqui só reage ao que o front mandou.
    const scored = scoredAll.filter((item) => {
      if (minScore !== undefined && (item.match?.score ?? -1) < minScore) {
        return false;
      }
      if (minSkillsPct !== undefined && (item.skillsPct ?? -1) < minSkillsPct) {
        return false;
      }
      if (
        excludeAnalyzed &&
        typeof bestScores.get(item.job.id)?.bestScore === "number"
      ) {
        return false;
      }
      return true;
    });

    const total = scored.length;
    const start = (parsedPage - 1) * parsedLimit;
    const pageItems = scored.slice(start, start + parsedLimit);

    const savedJobIds = await this.savedJobsService.listSavedJobIds(
      user.id,
      pageItems.map(({ job }) => job.id),
    );

    return {
      data: pageItems.map(({ job, match }) => {
        const existing = bestScores.get(job.id) ?? null;
        return {
          ...toPublicJobView(job),
          score: match?.score ?? null,
          breakdown: match?.breakdown ?? null,
          matchedSkills: match?.matchedSkills ?? [],
          missingSkills: match?.missingSkills ?? [],
          isSaved: savedJobIds.has(job.id),
          existingApplication: existing
            ? {
                id: existing.applicationId,
                status: existing.status,
                bestScore: existing.bestScore,
              }
            : null,
        };
      }),
      total,
      highCompatCount,
      page: parsedPage,
      limit: parsedLimit,
    };
  }

  @Get("facets")
  @InternalRoles("admin", "superadmin")
  @UseGuards(PublicJobsGhostModeGuard)
  async getFacets(@Req() _request: Request) {
    return this.jobsService.listPublicFacets();
  }

  // Precisa vir antes de ":slug" — "by-id" tem 2 segmentos e não colide,
  // mas manter perto do outro lookup por identificador único deixa claro
  // que os dois cobrem o mesmo caso de uso (fluxo de 1 clique a partir de
  // /vagas, que só tem o Job.id, não o slug).
  @Get("by-id/:id")
  @InternalRoles("admin", "superadmin")
  @UseGuards(PublicJobsGhostModeGuard)
  async getById(@Req() _request: Request, @Param("id") id: string) {
    const found = await this.jobsService.getPublicById(id);

    if (!found) {
      throw new NotFoundException("job not found");
    }

    return toPublicJobView(found);
  }

  @Get(":slug")
  @InternalRoles("admin", "superadmin")
  @UseGuards(PublicJobsGhostModeGuard)
  async getBySlug(@Req() _request: Request, @Param("slug") slug: string) {
    const found = await this.jobsService.getPublicBySlug(slug);

    if (!found) {
      throw new NotFoundException("job not found");
    }

    return toPublicJobView(found);
  }

  @Get(":slug/score")
  @UseGuards(JwtAuthGuard)
  async getScore(
    @AuthenticatedUser() user: AuthenticatedRequestUser,
    @Param("slug") slug: string,
  ) {
    const found = await this.jobsService.getPublicBySlug(slug);
    if (!found) {
      throw new NotFoundException("job not found");
    }

    // Independe do match Radar: o usuário pode ter analisado essa vaga
    // diretamente (via /adaptar?jobId=), sem depender de ter UserRadarProfile
    // ou de a vaga ter enrichment completo.
    const bestScores = await this.jobApplicationsService.getBestScoresByJobIds(
      user.id,
      [found.id],
    );
    const existing = bestScores.get(found.id) ?? null;
    const existingApplication = existing
      ? {
          id: existing.applicationId,
          status: existing.status,
          bestScore: existing.bestScore,
        }
      : null;

    const savedJobIds = await this.savedJobsService.listSavedJobIds(user.id, [
      found.id,
    ]);
    const isSaved = savedJobIds.has(found.id);

    const EMPTY_SCORE = {
      score: null,
      breakdown: null,
      matchedSkills: [] as string[],
      missingSkills: [] as string[],
      strengths: [] as string[],
      gaps: [] as string[],
      existingApplication,
      isSaved,
    };

    const radarProfile = await this.userRadarProfileService.getProfile(user.id);
    if (!radarProfile) {
      return EMPTY_SCORE;
    }

    const jobWithEnrichment = await this.jobsService.getByIdWithEnrichment(
      found.id,
    );
    if (
      !jobWithEnrichment?.enrichment ||
      jobWithEnrichment.enrichment.enrichmentStatus !== "COMPLETED"
    ) {
      return EMPTY_SCORE;
    }

    const matchScore = this.matchingEngine.calculateScore(
      {
        jobId: jobWithEnrichment.id,
        workModel: jobWithEnrichment.workModel,
        dominantArea: jobWithEnrichment.enrichment.dominantArea,
        areas: jobWithEnrichment.enrichment.areas,
        requiredSkills: jobWithEnrichment.enrichment.requiredSkills,
        technologies: jobWithEnrichment.enrichment.technologies,
        seniority: jobWithEnrichment.enrichment.seniority,
        languageRequirements: jobWithEnrichment.enrichment.languageRequirements,
      },
      {
        areas: radarProfile.areas,
        skills: radarProfile.skills,
        technologies: radarProfile.technologies,
        seniority: radarProfile.seniority,
        languages: radarProfile.languages,
        preferredWorkModels: radarProfile.preferredWorkModels,
      },
    );

    return {
      ...matchScore,
      strengths: matchScore.matchedSkills,
      gaps: matchScore.missingSkills,
      existingApplication,
      isSaved,
    };
  }
}
