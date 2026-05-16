import { Controller, Get, Inject, NotFoundException, Param } from "@nestjs/common";

import { buildPublicJobSlug, toPublicJobView } from "./public-job-view";
import { JobsService } from "./jobs.service";

@Controller("public/jobs")
export class PublicJobsController {
  constructor(@Inject(JobsService) private readonly jobsService: JobsService) {}

  @Get()
  async list() {
    const jobs = await this.jobsService.listPublic();
    return jobs.map((job) => toPublicJobView(job));
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
}
