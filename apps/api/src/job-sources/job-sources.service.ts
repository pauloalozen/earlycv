import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { CompaniesService } from "../companies/companies.service";
import { DatabaseService } from "../database/database.service";
import type { CreateJobSourceDto } from "./dto/create-job-source.dto";
import type { UpdateJobSourceDto } from "./dto/update-job-source.dto";

function normalizeSourceUrl(rawUrl: string) {
  const url = new URL(rawUrl.trim());

  url.hash = "";
  url.search = "";
  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  url.hostname = url.hostname.toLowerCase();

  return url.toString();
}

@Injectable()
export class JobSourcesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CompaniesService)
    private readonly companiesService: CompaniesService,
  ) {}

  list() {
    return this.database.jobSource.findMany({
      include: { company: true },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });
  }

  async getById(jobSourceId: string) {
    const jobSource = await this.database.jobSource.findUnique({
      where: { id: jobSourceId },
      include: { company: true },
    });

    if (!jobSource) {
      throw new NotFoundException("job source not found");
    }

    return jobSource;
  }

  async create(dto: CreateJobSourceDto) {
    await this.companiesService.getById(dto.companyId);
    const normalizedSourceUrl = normalizeSourceUrl(dto.sourceUrl);

    try {
      return await this.database.jobSource.create({
        data: {
          ...dto,
          sourceUrl: normalizedSourceUrl,
        },
        include: { company: true },
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
              : normalizeSourceUrl(dto.sourceUrl),
        },
        include: { company: true },
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
