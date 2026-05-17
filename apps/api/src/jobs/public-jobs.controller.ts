import {
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";

import { JwtAuthGuard } from "../common/jwt-auth.guard";
import { JobsService } from "./jobs.service";
import { buildPublicJobSlug, toPublicJobView } from "./public-job-view";

@Controller("public/jobs")
export class PublicJobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Get()
  async list(
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

    const { jobs, total } = await this.jobsService.listPublicFiltered({
      q,
      workModel,
      seniorityLevel,
      companyName,
      publishedWithin: validPublishedWithin,
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

  @Get("facets")
  async getFacets() {
    return this.jobsService.listPublicFacets();
  }

  @Get(":slug")
  async getBySlug(@Param("slug") slug: string) {
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
  getScore() {
    // TODO: implementar cálculo real com IA
    return { score: null, strengths: [], gaps: [] };
  }
}
