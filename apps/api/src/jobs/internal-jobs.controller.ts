import { Controller, Get, Inject, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { JobsService } from "./jobs.service";
import { toPublicJobView } from "./public-job-view";

const DEFAULT_TECH_MIN_COUNT = 10;
const DEFAULT_TOP_COMPANIES_LIMIT = 24;

// Sem autenticação de propósito: os dados aqui (slug/lastSeenAt de vagas
// ativas, listagem por empresa, listagem por tecnologia) são os mesmos que
// já ficam públicos em /radar — os consumidores são o sitemap.ts e as
// landing pages de SEO do web app, que rodam server-side sem sessão de
// usuário. Nunca adicionar campos sensíveis aqui.
@Controller("internal/jobs")
export class InternalJobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Get("sitemap-data")
  async getSitemapData(@Res({ passthrough: true }) response: Response) {
    const jobs = await this.jobsService.listSitemapData();

    response.setHeader("Cache-Control", "public, max-age=300");

    return jobs.map((job) => ({
      slug: job.slug,
      lastSeenAt: job.lastSeenAt.toISOString(),
      contentUpdatedAt: job.contentUpdatedAt?.toISOString() ?? null,
    }));
  }

  // Usado por /radar/empresa/[empresa]. companySlug é derivado do nome da
  // empresa (toCompanySlug, ver public-job-view.ts) — sem correspondência,
  // devolve jobs: [] pra o caller (a página) decidir o notFound().
  @Get("by-company/:companySlug")
  async getByCompanySlug(@Param("companySlug") companySlug: string) {
    const result = await this.jobsService.getPublicByCompanySlug(companySlug);

    if (!result) {
      return { companyName: null, jobs: [] };
    }

    return {
      companyName: result.companyName,
      jobs: result.jobs.map(toPublicJobView),
    };
  }

  // Usado por /radar/tecnologia/[tech]. minCount é o threshold de volume
  // mínimo pra a landing page existir (default 10, ver
  // JobsService#listPublicJobsByTech) — abaixo disso devolve jobs: [] e o
  // total real (pra debug/observabilidade), a página decide o notFound().
  @Get("by-tech/:tech")
  async getByTech(
    @Param("tech") tech: string,
    @Query("minCount") minCountRaw?: string,
  ) {
    const minCount = Math.max(
      1,
      Number.parseInt(minCountRaw ?? "", 10) || DEFAULT_TECH_MIN_COUNT,
    );
    const result = await this.jobsService.listPublicJobsByTech(
      tech.toLowerCase(),
      minCount,
    );

    return {
      total: result.total,
      jobs: result.jobs.map(toPublicJobView),
    };
  }

  // Usado pela landing page (marquee de empresas). Só devolve empresas com
  // pelo menos 1 vaga pública ativa agora — nunca uma lista estática.
  @Get("top-companies")
  async getTopCompanies(@Query("limit") limitRaw?: string) {
    const limit = Math.max(
      1,
      Number.parseInt(limitRaw ?? "", 10) || DEFAULT_TOP_COMPANIES_LIMIT,
    );

    return this.jobsService.listTopCompaniesWithActiveJobs(limit);
  }
}
