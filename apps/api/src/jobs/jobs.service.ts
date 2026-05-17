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
        seniorityLevel: true,
        sourceJobUrl: true,
        status: true,
        title: true,
        workModel: true,
      },
    });
  }

  async listPublicFiltered(filters: {
    q?: string;
    workModel?: string;
    seniorityLevel?: string;
    companyName?: string;
    publishedWithin?: "24h" | "3d" | "7d";
    page: number;
    limit: number;
  }) {
    const {
      q,
      workModel,
      seniorityLevel,
      companyName,
      publishedWithin,
      page,
      limit,
    } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.JobWhereInput = { status: "active" };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { descriptionClean: { contains: q, mode: "insensitive" } },
      ];
    }

    if (workModel) {
      where.workModel = workModel;
    }

    if (seniorityLevel) {
      where.seniorityLevel = seniorityLevel;
    }

    if (companyName) {
      where.company = { name: { contains: companyName, mode: "insensitive" } };
    }

    if (publishedWithin) {
      const hoursMap = { "24h": 24, "3d": 72, "7d": 168 } as const;
      const cutoff = new Date(
        Date.now() - hoursMap[publishedWithin] * 3_600_000,
      );
      where.publishedAtSource = { gte: cutoff };
    }

    const select = {
      canonicalKey: true,
      company: { select: { name: true } },
      country: true,
      descriptionClean: true,
      descriptionRaw: true,
      employmentType: true,
      firstSeenAt: true,
      id: true,
      lastSeenAt: true,
      locationText: true,
      publishedAtSource: true,
      seniorityLevel: true,
      sourceJobUrl: true,
      status: true,
      title: true,
      workModel: true,
    } as const;

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        orderBy: [{ firstSeenAt: "desc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
        select,
      }),
      this.database.job.count({ where }),
    ]);

    return { jobs, total, page, limit };
  }

  async listPublicFacets() {
    const jobs = await this.database.job.findMany({
      where: { status: "active" },
      select: {
        workModel: true,
        seniorityLevel: true,
        company: { select: { name: true } },
      },
    });

    const workModelMap = new Map<string, number>();
    const seniorityMap = new Map<string, number>();
    const companyMap = new Map<string, number>();

    for (const job of jobs) {
      if (job.workModel) {
        workModelMap.set(
          job.workModel,
          (workModelMap.get(job.workModel) ?? 0) + 1,
        );
      }
      if (job.seniorityLevel) {
        seniorityMap.set(
          job.seniorityLevel,
          (seniorityMap.get(job.seniorityLevel) ?? 0) + 1,
        );
      }
      const co = job.company.name;
      companyMap.set(co, (companyMap.get(co) ?? 0) + 1);
    }

    const toSorted = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

    return {
      workModels: toSorted(workModelMap),
      seniorityLevels: toSorted(seniorityMap),
      companies: toSorted(companyMap).slice(0, 20),
    };
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
