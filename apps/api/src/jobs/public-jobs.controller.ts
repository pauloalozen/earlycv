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
  AuthenticatedUser,
  type AuthenticatedRequestUser,
} from "../common/authenticated-user.decorator";
import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { InternalRoles } from "../common/roles.decorator";
import { MatchingEngine } from "../radar/matching.engine";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { JobsService } from "./jobs.service";
import { buildPublicJobSlug, toPublicJobView } from "./public-job-view";
import { PublicJobsGhostModeGuard } from "./public-jobs-ghost-mode.guard";

@Controller("public/jobs")
export class PublicJobsController {
  constructor(
    @Inject(JobsService) private readonly jobsService: JobsService,
    @Inject(UserRadarProfileService)
    private readonly userRadarProfileService: UserRadarProfileService,
    @Inject(MatchingEngine) private readonly matchingEngine: MatchingEngine,
  ) {}

  @Get()
  @InternalRoles("admin", "superadmin")
  @UseGuards(PublicJobsGhostModeGuard)
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
  ) {
    const validPublishedWithin = ["24h", "3d", "7d"].includes(
      publishedWithin ?? "",
    )
      ? (publishedWithin as "24h" | "3d" | "7d")
      : undefined;

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

      return {
        data: jobs.map((job) => toPublicJobView(job)),
        total,
        page: parsedPage,
        limit: parsedLimit,
      };
    }

    // Usuário logado com UserRadarProfile: filtra pelas mesmas regras do
    // MatchingEngine e ordena por score DESC (desempate por lastSeenAt
    // DESC). Sem paginação no banco aqui — o conjunto compatível já tende a
    // ser bem menor que o total de vagas ativas.
    const compatibleJobIds = await this.matchingEngine.filterCompatibleJobs({
      userId: user.id,
    });
    const jobsWithEnrichment = await this.jobsService.listByIdsWithEnrichment(
      compatibleJobIds,
      filters,
    );

    const scored = jobsWithEnrichment
      .filter((job) => job.enrichment)
      .map((job) => {
        // biome-ignore lint/style/noNonNullAssertion: filtrado acima
        const enrichment = job.enrichment!;
        const matchScore = this.matchingEngine.calculateScore(
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
        return { job, score: matchScore.score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.job.lastSeenAt.getTime() - a.job.lastSeenAt.getTime();
      });

    const total = scored.length;
    const start = (parsedPage - 1) * parsedLimit;
    const pageItems = scored.slice(start, start + parsedLimit);

    return {
      data: pageItems.map(({ job, score }) => ({
        ...toPublicJobView(job),
        score,
      })),
      total,
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

  @Get(":slug")
  @InternalRoles("admin", "superadmin")
  @UseGuards(PublicJobsGhostModeGuard)
  async getBySlug(@Req() _request: Request, @Param("slug") slug: string) {
    const jobs = await this.jobsService.listPublic();
    const found = jobs.find(
      (job) => buildPublicJobSlug(job.id, job.title, job.company.name) === slug,
    );

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
    const EMPTY_SCORE = {
      score: null,
      breakdown: null,
      matchedSkills: [] as string[],
      missingSkills: [] as string[],
      strengths: [] as string[],
      gaps: [] as string[],
    };

    const jobs = await this.jobsService.listPublic();
    const found = jobs.find(
      (job) => buildPublicJobSlug(job.id, job.title, job.company.name) === slug,
    );
    if (!found) {
      throw new NotFoundException("job not found");
    }

    const radarProfile = await this.userRadarProfileService.getProfile(
      user.id,
    );
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
    };
  }
}
