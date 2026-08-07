import { Controller, Get, Inject, Res } from "@nestjs/common";
import type { Response } from "express";

import { JobsService } from "./jobs.service";

// Sem autenticação de propósito: os dados aqui (slug + lastSeenAt de vagas
// ativas) são os mesmos que já ficam públicos em /vagas — o único consumidor
// hoje é o sitemap.ts do web app, que roda server-side e não tem sessão de
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
    }));
  }
}
