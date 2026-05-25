import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { CompaniesService } from "../companies/companies.service";
import { DatabaseService } from "../database/database.service";
import { canonicalizeSourceUrl } from "../ingestion/url-normalization";
import type { CreateJobSourceDto } from "./dto/create-job-source.dto";
import type { ListJobSourcesDto } from "./dto/list-job-sources.dto";
import type { UpdateJobSourceDto } from "./dto/update-job-source.dto";

@Injectable()
export class JobSourcesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CompaniesService)
    private readonly companiesService: CompaniesService,
  ) {}

  list() {
    return this.database.jobSource.findMany({
      include: {
        company: true,
        ingestionRuns: {
          orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async listPaginated(dto: ListJobSourcesDto) {
    const page = Math.max(1, dto.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, dto.pageSize ?? 50));
    const skip = (page - 1) * pageSize;

    const where: Prisma.JobSourceWhereInput = {};

    if (dto.search) {
      where.OR = [
        { sourceName: { contains: dto.search, mode: "insensitive" } },
        { company: { name: { contains: dto.search, mode: "insensitive" } } },
      ];
    }

    if (dto.typeFilter) {
      where.sourceType = dto.typeFilter as Prisma.EnumJobSourceTypeFilter;
    }

    if (dto.statusFilter) {
      if (dto.statusFilter === "aguardando primeiro run") {
        where.ingestionRuns = { none: {} };
      } else if (dto.statusFilter === "falha recente") {
        where.OR = [
          ...(where.OR ?? []),
          { lastErrorMessage: { not: null } },
          { ingestionRuns: { some: { status: "failed" } } },
        ];
      } else if (dto.statusFilter === "ativa") {
        where.lastErrorMessage = null;
        where.ingestionRuns = { some: {} };
      }
    }

    const sourceInclude = {
      company: true,
      ingestionRuns: {
        orderBy: [
          { startedAt: "desc" as const },
          { createdAt: "desc" as const },
        ],
        take: 1,
      },
    };

    const [rows, total] = await Promise.all([
      this.database.jobSource.findMany({
        where,
        include: sourceInclude,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      this.database.jobSource.count({ where }),
    ]);

    // Active jobs count per source — single aggregate query, no N+1
    const sourceIds = rows.map((s) => s.id);
    const activeCounts =
      sourceIds.length > 0
        ? await this.database.job.groupBy({
            by: ["jobSourceId"],
            where: { jobSourceId: { in: sourceIds }, status: "active" },
            _count: { id: true },
          })
        : [];
    const countMap = new Map(
      activeCounts.map((r) => [r.jobSourceId, r._count.id]),
    );

    return {
      page,
      pageSize,
      rows: rows.map((r) => ({
        ...r,
        activeJobsCount: countMap.get(r.id) ?? 0,
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getById(jobSourceId: string) {
    const jobSource = await this.database.jobSource.findUnique({
      where: { id: jobSourceId },
      include: {
        company: true,
        ingestionRuns: {
          orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
          take: 10,
        },
      },
    });

    if (!jobSource) {
      throw new NotFoundException("job source not found");
    }

    return jobSource;
  }

  async create(dto: CreateJobSourceDto) {
    await this.companiesService.getById(dto.companyId);
    const normalizedSourceUrl = canonicalizeSourceUrl(dto.sourceUrl);

    try {
      return await this.database.jobSource.create({
        data: {
          ...dto,
          sourceUrl: normalizedSourceUrl,
        },
        include: {
          company: true,
          ingestionRuns: {
            orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async update(jobSourceId: string, dto: UpdateJobSourceDto) {
    await this.getById(jobSourceId);

    try {
      return await this.database.jobSource.update({
        where: { id: jobSourceId },
        data: {
          ...dto,
          sourceUrl:
            dto.sourceUrl === undefined
              ? undefined
              : canonicalizeSourceUrl(dto.sourceUrl),
        },
        include: {
          company: true,
          ingestionRuns: {
            orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
        },
      });
    } catch (error) {
      this.rethrowKnownError(error);
    }
  }

  async remove(jobSourceId: string) {
    await this.getById(jobSourceId);
    await this.database.jobSource.delete({ where: { id: jobSourceId } });

    return { ok: true } as const;
  }

  private rethrowKnownError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("job source already exists for this company");
    }

    throw error;
  }
}
