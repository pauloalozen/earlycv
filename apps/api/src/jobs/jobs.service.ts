import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { CompaniesService } from "../companies/companies.service";
import { DatabaseService } from "../database/database.service";
import { JobSourcesService } from "../job-sources/job-sources.service";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";

function normalizeSourceJobUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.hostname = url.hostname.toLowerCase();

  return url.toString();
}

@Injectable()
export class JobsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CompaniesService)
    private readonly companiesService: CompaniesService,
    @Inject(JobSourcesService)
    private readonly jobSourcesService: JobSourcesService,
  ) {}

  async create(dto: CreateJobDto) {
    await this.assertCatalogLink(dto.companyId, dto.jobSourceId);
    this.assertSeenAtOrdering(dto.firstSeenAt, dto.lastSeenAt);

    try {
      return await this.database.job.create({
        data: {
          ...dto,
          sourceJobUrl: normalizeSourceJobUrl(dto.sourceJobUrl),
          firstSeenAt: new Date(dto.firstSeenAt),
          lastSeenAt: new Date(dto.lastSeenAt),
          publishedAtSource: dto.publishedAtSource
            ? new Date(dto.publishedAtSource)
            : undefined,
        },
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  list() {
    return this.database.job.findMany({
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  listPublic() {
    return this.database.job.findMany({
      where: { status: "active" },
      orderBy: [{ firstSeenAt: "desc" }, { updatedAt: "desc" }],
      select: {
        canonicalKey: true,
        company: {
          select: {
            name: true,
          },
        },
        country: true,
        descriptionClean: true,
        descriptionRaw: true,
        employmentType: true,
        firstSeenAt: true,
        id: true,
        lastSeenAt: true,
        locationText: true,
        publishedAtSource: true,
        sourceJobUrl: true,
        status: true,
        title: true,
        workModel: true,
      },
    });
  }

  async getById(jobId: string) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException("job not found");
    }

    return job;
  }

  async update(jobId: string, dto: UpdateJobDto) {
    const currentJob = await this.getById(jobId);
    this.assertSeenAtOrdering(
      currentJob.firstSeenAt.toISOString(),
      dto.lastSeenAt,
    );

    return this.database.job.update({
      where: { id: jobId },
      data: {
        ...dto,
        lastSeenAt:
          dto.lastSeenAt === undefined ? undefined : new Date(dto.lastSeenAt),
        publishedAtSource:
          dto.publishedAtSource === undefined
            ? undefined
            : new Date(dto.publishedAtSource),
      },
    });
  }

  async remove(jobId: string) {
    await this.getById(jobId);
    await this.database.job.delete({ where: { id: jobId } });

    return { ok: true } as const;
  }

  private async assertCatalogLink(companyId: string, jobSourceId: string) {
    const [company, jobSource] = await Promise.all([
      this.companiesService.getById(companyId),
      this.jobSourcesService.getById(jobSourceId),
    ]);

    if (jobSource.companyId !== company.id) {
      throw new BadRequestException(
        "job source must belong to the provided company",
      );
    }
  }

  private assertSeenAtOrdering(firstSeenAt: string, lastSeenAt?: string) {
    if (!lastSeenAt) {
      return;
    }

    if (new Date(firstSeenAt) > new Date(lastSeenAt)) {
      throw new BadRequestException(
        "firstSeenAt must be less than or equal to lastSeenAt",
      );
    }
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("job already exists for this canonical key");
    }

    throw error;
  }
}
