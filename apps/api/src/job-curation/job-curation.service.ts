import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  type JobArea,
  type LinkedinCurationStatus,
  SeniorityLevel,
} from "@prisma/client";
import { DatabaseService } from "../database/database.service";
import type { GetCurationCountersDto } from "./dto/get-curation-counters.dto";
import type { ListCurationJobsDto } from "./dto/list-curation-jobs.dto";
import type { UpdateCurationStatusDto } from "./dto/update-curation-status.dto";
import { resolveCurationDateRange } from "./sao-paulo-date-range";

type SharedFilterParams = {
  areaFilter?: JobArea;
  companyFilter?: string;
  workModelFilter?: string;
  locationFilter?: string;
  curationStatusFilter?: LinkedinCurationStatus;
};

function assertLinkedinHost(rawUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new BadRequestException("linkedinUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new BadRequestException("linkedinUrl must use https");
  }

  const host = parsed.hostname.toLowerCase();
  // Exatamente linkedin.com ou um subdomínio real (ex.: www.linkedin.com,
  // br.linkedin.com) — nunca um domínio que só contenha a palavra
  // "linkedin" (ex.: notlinkedin.com, linkedin.com.evil.com).
  if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) {
    throw new BadRequestException(
      "linkedinUrl must point to linkedin.com or a subdomain of it",
    );
  }
}

@Injectable()
export class JobCurationService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // AND-array de propósito (em vez de mesclar chaves soltas no where): tanto
  // listJobs quanto getSeniorityCounters precisam compor este filtro base
  // com condições extras (seniorityFilter num caso, enrichment:null no
  // outro) sem risco de uma chave sobrescrever a outra.
  private buildBaseWhere(
    params: SharedFilterParams & { seniorityFilter?: SeniorityLevel },
    range: { gte: Date; lt: Date },
  ): Prisma.JobWhereInput {
    const and: Prisma.JobWhereInput[] = [
      { firstSeenAt: { gte: range.gte, lt: range.lt } },
    ];

    if (params.companyFilter) {
      and.push({
        company: {
          name: { contains: params.companyFilter, mode: "insensitive" },
        },
      });
    }

    if (params.workModelFilter) {
      and.push({ workModel: params.workModelFilter });
    }

    if (params.locationFilter) {
      and.push({
        locationText: { contains: params.locationFilter, mode: "insensitive" },
      });
    }

    if (params.areaFilter || params.seniorityFilter) {
      and.push({
        enrichment: {
          ...(params.areaFilter ? { dominantArea: params.areaFilter } : {}),
          ...(params.seniorityFilter
            ? { seniority: params.seniorityFilter }
            : {}),
        },
      });
    }

    if (params.curationStatusFilter) {
      if (params.curationStatusFilter === "NOT_CHECKED") {
        // Ausência de linha == NOT_CHECKED (vaga antiga, nunca curada).
        and.push({
          OR: [
            { linkedinCuration: null },
            { linkedinCuration: { status: "NOT_CHECKED" } },
          ],
        });
      } else {
        and.push({
          linkedinCuration: { status: params.curationStatusFilter },
        });
      }
    }

    return { AND: and };
  }

  async listJobs(dto: ListCurationJobsDto) {
    const range = resolveCurationDateRange(dto.period, dto.date);
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = this.buildBaseWhere(
      {
        areaFilter: dto.areaFilter,
        seniorityFilter: dto.seniorityFilter,
        companyFilter: dto.companyFilter,
        workModelFilter: dto.workModelFilter,
        locationFilter: dto.locationFilter,
        curationStatusFilter: dto.curationStatusFilter,
      },
      range,
    );

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        include: {
          company: { select: { name: true } },
          enrichment: {
            select: {
              dominantArea: true,
              seniority: true,
              enrichmentStatus: true,
            },
          },
          linkedinCuration: true,
        },
        orderBy: [{ firstSeenAt: "desc" }],
        skip,
        take: pageSize,
      }),
      this.database.job.count({ where }),
    ]);

    return { jobs, total, page, pageSize };
  }

  // Contadores por senioridade — respeita todos os filtros exceto
  // senioridade (ver docstring de GetCurationCountersDto), pra o admin ver a
  // distribuição completa antes de escolher a faixa.
  async getSeniorityCounters(dto: GetCurationCountersDto) {
    const range = resolveCurationDateRange(dto.period, dto.date);
    const where = this.buildBaseWhere(
      {
        areaFilter: dto.areaFilter,
        companyFilter: dto.companyFilter,
        workModelFilter: dto.workModelFilter,
        locationFilter: dto.locationFilter,
        curationStatusFilter: dto.curationStatusFilter,
      },
      range,
    );

    const [enrichmentGroups, noEnrichmentCount] = await Promise.all([
      this.database.jobEnrichment.groupBy({
        by: ["seniority"],
        where: { job: where },
        _count: { _all: true },
      }),
      this.database.job.count({ where: { ...where, enrichment: null } }),
    ]);

    const counts = new Map<SeniorityLevel, number>();
    // Enrichment existe mas seniority ficou null (ex.: enriquecimento não
    // COMPLETED) — dobra na mesma cesta de "sem enriquecimento", já que do
    // ponto de vista da curadoria a taxonomia simplesmente não está
    // disponível pra essa vaga.
    let semTaxonomiaViaEnrichment = 0;
    for (const group of enrichmentGroups) {
      if (group.seniority === null) {
        semTaxonomiaViaEnrichment = group._count._all;
        continue;
      }
      counts.set(group.seniority, group._count._all);
    }

    const bySeniority = Object.values(SeniorityLevel).map((seniority) => ({
      seniority,
      count: counts.get(seniority) ?? 0,
    }));

    return {
      bySeniority,
      semEnriquecimento: noEnrichmentCount + semTaxonomiaViaEnrichment,
    };
  }

  async setCurationStatus(
    jobId: string,
    dto: UpdateCurationStatusDto,
    adminId: string,
  ) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
      select: { id: true },
    });
    if (!job) {
      throw new NotFoundException("job not found");
    }

    let linkedinUrl: string | null = null;
    if (dto.status === "FOUND_ON_LINKEDIN") {
      if (!dto.linkedinUrl) {
        throw new BadRequestException(
          "linkedinUrl is required when status is FOUND_ON_LINKEDIN",
        );
      }
      assertLinkedinHost(dto.linkedinUrl);
      linkedinUrl = dto.linkedinUrl;
    }

    const checkedAt = new Date();

    return this.database.jobLinkedinCuration.upsert({
      where: { jobId },
      create: {
        jobId,
        status: dto.status,
        linkedinUrl,
        checkedByAdminId: adminId,
        checkedAt,
      },
      update: {
        status: dto.status,
        linkedinUrl,
        checkedByAdminId: adminId,
        checkedAt,
      },
    });
  }
}
