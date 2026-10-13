import { Inject, Injectable, NotFoundException } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { JobLifecycleService } from "./job-lifecycle.service";

export type PendingReviewJob = {
  id: string;
  slug: string | null;
  title: string;
  companyName: string;
  locationText: string;
  country: string | null;
  state: string | null;
  city: string | null;
  sourceUrl: string | null;
  firstSeenAt: Date;
};

// Revisão manual de vaga em pending_review (hoje: só "Remote" de board
// global). Aprovar devolve ao radar e marca reviewApprovedAt (recrawl não a
// devolve para revisão); rejeitar marca removed (recrawl não a recria).
@Injectable()
export class JobReviewService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(JobLifecycleService)
    private readonly jobLifecycle: JobLifecycleService,
  ) {}

  async listPending(params: { page: number; pageSize: number }): Promise<{
    jobs: PendingReviewJob[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const pageSize = Math.min(100, Math.max(1, params.pageSize));
    const page = Math.max(1, params.page);
    const where = { status: "pending_review" as const };
    const [rows, total] = await Promise.all([
      this.database.job.findMany({
        orderBy: [{ firstSeenAt: "desc" }, { id: "asc" }],
        select: {
          city: true,
          company: { select: { name: true } },
          country: true,
          firstSeenAt: true,
          id: true,
          jobSource: { select: { sourceUrl: true } },
          locationText: true,
          slug: true,
          state: true,
          title: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        where,
      }),
      this.database.job.count({ where }),
    ]);

    return {
      jobs: rows.map((row) => ({
        city: row.city,
        companyName: row.company.name,
        country: row.country,
        firstSeenAt: row.firstSeenAt,
        id: row.id,
        locationText: row.locationText,
        slug: row.slug,
        sourceUrl: row.jobSource?.sourceUrl ?? null,
        state: row.state,
        title: row.title,
      })),
      page,
      pageSize,
      total,
    };
  }

  async approve(jobId: string): Promise<{ ok: true }> {
    const { count } = await this.jobLifecycle.activateJobs({
      data: { reviewApprovedAt: new Date() },
      reason: "location-review-approved",
      where: { id: jobId, status: "pending_review" },
    });
    if (count === 0) throw new NotFoundException("job not pending review");
    return { ok: true };
  }

  async reject(jobId: string): Promise<{ ok: true }> {
    const { count } = await this.jobLifecycle.closeJobs({
      reason: "location-review-rejected",
      status: "removed",
      where: { id: jobId, status: "pending_review" },
    });
    if (count === 0) throw new NotFoundException("job not pending review");
    return { ok: true };
  }
}
