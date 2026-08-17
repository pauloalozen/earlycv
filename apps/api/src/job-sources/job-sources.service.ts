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
import type { BulkDeleteJobSourcesDto } from "./dto/bulk-delete-job-sources.dto";
import type { BulkUpdateActiveDto } from "./dto/bulk-update-active.dto";
import type { BulkUpdateScheduleDto } from "./dto/bulk-update-schedule.dto";
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

    const sortDir = dto.sortDir ?? "asc";
    const dbOrderBy: Prisma.JobSourceOrderByWithRelationInput[] =
      dto.sortBy === "sourceName"
        ? [{ sourceName: sortDir }]
        : dto.sortBy === "company"
          ? [{ company: { name: sortDir } }]
          : dto.sortBy === "sourceType"
            ? [{ sourceType: sortDir }]
            : dto.sortBy === "createdAt"
              ? [{ createdAt: sortDir }]
              // Default is alphabetical by name — sorting by updatedAt
              // made any toggle/run/edit jump that source to the top,
              // reordering the table on every action.
              : [{ sourceName: "asc" }];

    // activeJobsCount is derived (not a column), so it can't be sorted at
    // the database level — fetch every matching row, sort in memory, then
    // paginate. Fine at this module's current scale (low hundreds of rows).
    if (dto.sortBy === "activeJobsCount") {
      const allRows = await this.database.jobSource.findMany({
        where,
        include: sourceInclude,
      });

      const allIds = allRows.map((s) => s.id);
      const allCounts =
        allIds.length > 0
          ? await this.database.job.groupBy({
              by: ["jobSourceId"],
              where: { jobSourceId: { in: allIds }, status: "active" },
              _count: { id: true },
            })
          : [];
      const allCountMap = new Map(
        allCounts.map((r) => [r.jobSourceId, r._count.id]),
      );

      const sorted = allRows
        .map((r) => ({ ...r, activeJobsCount: allCountMap.get(r.id) ?? 0 }))
        .sort((a, b) =>
          sortDir === "asc"
            ? a.activeJobsCount - b.activeJobsCount
            : b.activeJobsCount - a.activeJobsCount,
        );

      return {
        page,
        pageSize,
        rows: sorted.slice(skip, skip + pageSize),
        total: sorted.length,
        totalPages: Math.max(1, Math.ceil(sorted.length / pageSize)),
      };
    }

    const [rows, total] = await Promise.all([
      this.database.jobSource.findMany({
        where,
        include: sourceInclude,
        orderBy: dbOrderBy,
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
    await this.assertSourceUrlNotTaken(normalizedSourceUrl);

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

  async bulkUpdateSchedule(dto: BulkUpdateScheduleDto) {
    const { count } = await this.database.jobSource.updateMany({
      where: { sourceType: dto.sourceType },
      data: { scheduleEnabled: dto.scheduleEnabled },
    });

    return { count, scheduleEnabled: dto.scheduleEnabled, sourceType: dto.sourceType };
  }

  async bulkUpdateActive(dto: BulkUpdateActiveDto) {
    const { count } = await this.database.jobSource.updateMany({
      where: { sourceType: dto.sourceType },
      data: { isActive: dto.isActive },
    });

    return { count, isActive: dto.isActive, sourceType: dto.sourceType };
  }

  // Fontes com a mesma sourceUrl sob companies diferentes — normalmente
  // sinal de duplicidade real (mesma empresa cadastrada mais de uma vez
  // com nomes diferentes, ex: "RAIZEN S.A." e "RAIZEN COMBUSTIVEIS" ambas
  // apontando pro mesmo board gupy). O dedup em
  // DiscoveredCompaniesService.importCandidateAsSource evita isso pra
  // fontes novas (ver fix do bug de barra final), mas não limpa o que já
  // existe — aqui só lista os grupos, a decisão de qual manter/excluir é
  // manual (botão "Excluir" já existente por fonte).
  async findDuplicates() {
    const groups = await this.database.jobSource.groupBy({
      by: ["sourceUrl"],
      _count: { _all: true },
      having: { sourceUrl: { _count: { gt: 1 } } },
    });

    if (groups.length === 0) return [];

    const duplicateUrls = groups.map((g) => g.sourceUrl);
    const sources = await this.database.jobSource.findMany({
      where: { sourceUrl: { in: duplicateUrls } },
      include: {
        company: { select: { id: true, name: true } },
        _count: { select: { jobs: true } },
      },
      orderBy: [{ sourceUrl: "asc" }, { createdAt: "asc" }],
    });

    const bySourceUrl = new Map<string, typeof sources>();
    for (const source of sources) {
      const bucket = bySourceUrl.get(source.sourceUrl) ?? [];
      bucket.push(source);
      bySourceUrl.set(source.sourceUrl, bucket);
    }

    return [...bySourceUrl.entries()]
      .map(([sourceUrl, group]) => ({
        count: group.length,
        sourceType: group[0]?.sourceType,
        sourceUrl,
        sources: group.map((source) => ({
          companyId: source.companyId,
          companyName: source.company.name,
          createdAt: source.createdAt,
          id: source.id,
          isActive: source.isActive,
          jobCount: source._count.jobs,
          sourceName: source.sourceName,
        })),
      }))
      .sort((a, b) => b.count - a.count);
  }

  // Usado pelo painel de fontes duplicadas — tanto pra excluir uma fonte
  // isolada quanto pro fluxo "manter esta, apagar as outras N do mesmo
  // sourceUrl" num só request (evita N chamadas sequenciais e o
  // navigate-away de um <form action> por linha).
  async bulkDelete(dto: BulkDeleteJobSourcesDto) {
    if (dto.removeJobs) {
      await this.database.job.updateMany({
        where: { jobSourceId: { in: dto.ids } },
        data: { status: "removed" },
      });
    }

    const { count } = await this.database.jobSource.deleteMany({
      where: { id: { in: dto.ids } },
    });

    return { count };
  }

  // Excluir uma fonte não pode arrastar o histórico de produto das vagas
  // que vieram dela (firstSeenAt, candidaturas, páginas públicas indexadas)
  // — por isso Job.jobSourceId é nullable (SetNull) em vez de cascade. O
  // caller decide explicitamente se quer fechar as vagas dessa fonte
  // (status "removed", mesmo status que um crawl normal já usa quando uma
  // vaga some do board) ou deixá-las órfãs e ativas.
  async remove(jobSourceId: string, removeJobs = false) {
    await this.getById(jobSourceId);

    if (removeJobs) {
      await this.database.job.updateMany({
        where: { jobSourceId },
        data: { status: "removed" },
      });
    }

    await this.database.jobSource.delete({ where: { id: jobSourceId } });

    return { ok: true } as const;
  }

  // Sem constraint de banco global em sourceUrl ainda (bloqueada pelas
  // duplicatas já existentes — ver findDuplicates) — checagem em app-level,
  // chamada por toda via de criação (manual aqui, CSV/promoção em
  // AdminIngestionImportService.importRow). Mensagem nomeia a fonte
  // conflitante pra o usuário decidir na hora, em vez de um 500/P2002 cru.
  // Pre-check pro fluxo "criar empresa + primeira fonte" do admin (web) —
  // sem isso, a UI só descobria o conflito depois de já ter criado a
  // Company (a fonte falha, a empresa fica órfã "sem fonte vinculada").
  // Canonicaliza igual assertSourceUrlNotTaken pra bater com o que está
  // salvo (barra final em URL de caminho vazio etc.).
  async checkUrlAvailable(rawUrl: string) {
    let sourceUrl: string;
    try {
      sourceUrl = canonicalizeSourceUrl(rawUrl);
    } catch {
      // URL invalida/vazia nao e conflito — o erro real de validacao
      // aparece na hora de criar de verdade (canonicalizeSourceUrl la).
      return { taken: false as const };
    }

    const existing = await this.database.jobSource.findFirst({
      include: { company: true },
      where: { sourceUrl },
    });

    if (!existing) return { taken: false as const };

    return {
      companyName: existing.company.name,
      sourceName: existing.sourceName,
      taken: true as const,
    };
  }

  private async assertSourceUrlNotTaken(sourceUrl: string) {
    const existing = await this.database.jobSource.findFirst({
      include: { company: true },
      where: { sourceUrl },
    });
    if (existing) {
      throw new ConflictException(
        `a fonte "${existing.sourceName}" (${existing.company.name}) já tem essa URL cadastrada`,
      );
    }
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
