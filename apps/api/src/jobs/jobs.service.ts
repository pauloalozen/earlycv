import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JobArea, Prisma, SeniorityLevel } from "@prisma/client";

import { CompaniesService } from "../companies/companies.service";
import { DatabaseService } from "../database/database.service";
import { JobSourcesService } from "../job-sources/job-sources.service";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import { normalizeState } from "./geo-normalizer";

const PUBLIC_JOB_SELECT = {
  canonicalKey: true,
  city: true,
  company: {
    select: {
      name: true,
      websiteUrl: true,
    },
  },
  country: true,
  descriptionClean: true,
  descriptionRaw: true,
  employmentType: true,
  enrichment: { select: { technologies: true } },
  firstSeenAt: true,
  id: true,
  lastSeenAt: true,
  locationText: true,
  publishedAtSource: true,
  seniorityLevel: true,
  slug: true,
  sourceJobUrl: true,
  state: true,
  status: true,
  title: true,
  workModel: true,
} satisfies Prisma.JobSelect;

// Captura falhou (ex: Gupy devolveu detail sem conteudo, ou payload sem
// titulo) — a vaga fica visivel só pro admin (getById), nunca pro público,
// mesmo que status siga "active". Reaproveitado em toda query pública.
const PUBLIC_JOB_INTEGRITY_WHERE = {
  descriptionClean: { not: "" },
  title: { not: "" },
  // Vagas sem slug (ainda não backfilled após a migration que adicionou o
  // campo) ficam fora do público até o backfill rodar — evita link quebrado
  // /vagas/null-... antes do backfill manual.
  slug: { not: null },
  // Vaga ainda PENDING/PROCESSING/FAILED/SKIPPED de enriquecimento não tem
  // dominantArea/technologies/seniority — sem isso o Radar não calcula
  // compatibilidade nenhuma pra ninguém, então ela não entra no portal até
  // o enriquecimento terminar (worker assíncrono, ver
  // ingestion.service.ts). Decisão de produto: vaga "crua" não é conteúdo
  // publicável, nem pro anônimo nem pro logado.
  enrichment: { enrichmentStatus: "COMPLETED" },
} satisfies Prisma.JobWhereInput;

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

// Query params de área/senioridade chegam como texto livre (URL) — só os
// valores que batem com o enum do Prisma entram no WHERE, o resto é
// ignorado silenciosamente (evita 500 por enum inválido vindo de um link
// externo desatualizado ou digitação manual na URL).
function splitEnumCsv<T extends string>(
  value: string,
  allowed: readonly T[],
): T[] {
  const allowedSet = new Set<string>(allowed);
  return splitCsv(value).filter((v): v is T => allowedSet.has(v));
}

const JOB_AREA_VALUES = Object.values(JobArea);
const SENIORITY_LEVEL_VALUES = Object.values(SeniorityLevel);

// Localidade (Job.state/Job.city) é texto livre vindo direto do crawler —
// sem normalização geográfica (Job.city — o ingestion normaliza pra
// title-case a partir de agora, mas vagas antigas ainda têm grafia crua até
// serem re-crawladas). Agrupa só por case (trim + lowercase) pra não listar
// "São Paulo" e "SAO PAULO" como duas facetas diferentes; o filtro em si
// compara com mode "insensitive", então qualquer variante de caixa do mesmo
// texto ainda combina, mesmo que a faceta mostrada seja só uma das grafias.
function groupLocationValues(
  values: Array<string | null>,
): Array<{ value: string; count: number }> {
  const groups = new Map<string, Map<string, number>>();

  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const originals = groups.get(key) ?? new Map<string, number>();
    originals.set(trimmed, (originals.get(trimmed) ?? 0) + 1);
    groups.set(key, originals);
  }

  return [...groups.values()]
    .map((originals) => {
      const [display] = [...originals.entries()].sort((a, b) => b[1] - a[1])[0] as [
        string,
        number,
      ];
      const total = [...originals.values()].reduce((a, b) => a + b, 0);
      return { value: display, count: total };
    })
    .sort((a, b) => b.count - a.count);
}

// Job.state guarda a sigla como valor canônico a partir da normalização de
// geo-normalizer.ts, mas vagas antigas (ainda não re-crawladas) podem ter
// "São Paulo", "SAO PAULO" ou "SP" convivendo — normalizeState reconhece
// todas essas grafias e agrupa as três num único facet { value: "SP", label:
// "São Paulo" }. Estado que não bate com nenhuma das 27 UFs (de fora do
// Brasil, ou lixo de dado) cai no fallback de groupLocationValues — mesma
// faceta "melhor esforço" de antes, sem nome por extenso.
function buildStateFacets(
  values: Array<string | null>,
): Array<{ value: string; label: string; count: number }> {
  const known = new Map<string, { nome: string; count: number }>();
  const unknown: Array<string | null> = [];

  for (const raw of values) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const normalized = normalizeState(trimmed);
    if (!normalized) {
      unknown.push(trimmed);
      continue;
    }
    const existing = known.get(normalized.sigla);
    known.set(normalized.sigla, {
      nome: normalized.nome,
      count: (existing?.count ?? 0) + 1,
    });
  }

  const knownFacets = [...known.entries()].map(([sigla, { nome, count }]) => ({
    value: sigla,
    label: nome,
    count,
  }));
  const unknownFacets = groupLocationValues(unknown).map((f) => ({
    value: f.value,
    label: f.value,
    count: f.count,
  }));

  return [...knownFacets, ...unknownFacets].sort((a, b) => b.count - a.count);
}

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

  async listAdmin(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    sourceFilter?: string;
    statusFilter?: string;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.JobWhereInput = {};

    if (params.search) {
      const term = params.search;
      where.OR = [
        { title: { contains: term, mode: "insensitive" } },
        { locationText: { contains: term, mode: "insensitive" } },
        { company: { name: { contains: term, mode: "insensitive" } } },
      ];
    }

    if (params.sourceFilter) {
      where.jobSource = {
        sourceName: { equals: params.sourceFilter, mode: "insensitive" },
      };
    }

    if (params.statusFilter) {
      where.status = params.statusFilter as Prisma.EnumJobStatusFilter;
    }

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        include: { company: { select: { name: true } } },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
      }),
      this.database.job.count({ where }),
    ]);

    return { jobs, total, page, pageSize };
  }

  listPublic() {
    return this.database.job.findMany({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
      select: PUBLIC_JOB_SELECT,
    });
  }

  // Usado pelo sitemap.ts do web app (GET /internal/jobs/sitemap-data).
  // Mesmo critério de PUBLIC_JOB_INTEGRITY_WHERE das outras queries públicas
  // — uma vaga que não aparece em /vagas ou /vagas/[slug] não deve aparecer
  // no sitemap (senão o Google indexa uma URL que sempre 404).
  async listSitemapData() {
    const jobs = await this.database.job.findMany({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      select: { slug: true, lastSeenAt: true },
      orderBy: { lastSeenAt: "desc" },
    });

    return jobs.filter(
      (job): job is { slug: string; lastSeenAt: Date } => job.slug !== null,
    );
  }

  // Usado pelo fluxo de 1 clique (/adaptar?jobId=...) — o front só tem o id
  // (veio do botão "Analisar meu CV" na listagem/detalhe), não o slug.
  async getPublicById(jobId: string) {
    return this.database.job.findFirst({
      where: { id: jobId, status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      select: PUBLIC_JOB_SELECT,
    });
  }

  // Usado por /vagas/[slug] e /vagas/[slug]/score — query direta pelo campo
  // slug (indexado e único), no lugar de carregar listPublic() inteiro e
  // fazer Array.find recalculando o slug de cada vaga.
  async getPublicBySlug(slug: string) {
    return this.database.job.findFirst({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE, slug },
      select: PUBLIC_JOB_SELECT,
    });
  }

  private buildPublicJobsWhere(filters: {
    q?: string;
    workModel?: string;
    seniorityLevel?: string;
    companyName?: string;
    publishedWithin?: "24h" | "3d" | "7d";
    area?: string;
    seniority?: string;
    state?: string;
    city?: string;
  }): Prisma.JobWhereInput {
    const {
      q,
      workModel,
      seniorityLevel,
      companyName,
      publishedWithin,
      area,
      seniority,
      state,
      city,
    } = filters;
    // Construído à parte (em vez de remendar where.enrichment em cada if)
    // porque o tipo gerado pelo Prisma pra relação 1:1 opcional (XOR entre
    // o filtro de relação e o where do model relacionado) não dá pra
    // espalhar/mesclar com segurança de tipos depois de já atribuído.
    const enrichmentWhere: Prisma.JobEnrichmentWhereInput = {
      ...PUBLIC_JOB_INTEGRITY_WHERE.enrichment,
    };

    const where: Prisma.JobWhereInput = {
      status: "active",
      ...PUBLIC_JOB_INTEGRITY_WHERE,
      enrichment: enrichmentWhere,
    };

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { descriptionClean: { contains: q, mode: "insensitive" } },
      ];
    }

    if (workModel) {
      where.workModel = { in: splitCsv(workModel) };
    }

    // Campo legado (Job.seniorityLevel) — texto livre nunca preenchido pelo
    // ingestion, mantido só por compatibilidade retroativa do query param.
    // O filtro de senioridade real usado pelo /radar é `seniority`, abaixo,
    // que aponta pro enum estruturado (JobEnrichment.seniority).
    if (seniorityLevel) {
      where.seniorityLevel = { in: splitCsv(seniorityLevel) };
    }

    if (companyName) {
      where.company = {
        name: { in: splitCsv(companyName), mode: "insensitive" },
      };
    }

    if (publishedWithin) {
      const hoursMap = { "24h": 24, "3d": 72, "7d": 168 } as const;
      const cutoff = new Date(
        Date.now() - hoursMap[publishedWithin] * 3_600_000,
      );
      where.publishedAtSource = { gte: cutoff };
    }

    if (area) {
      const values = splitEnumCsv(area, JOB_AREA_VALUES);
      if (values.length > 0) {
        enrichmentWhere.dominantArea = { in: values };
      }
    }

    if (seniority) {
      const values = splitEnumCsv(seniority, SENIORITY_LEVEL_VALUES);
      if (values.length > 0) {
        enrichmentWhere.seniority = { in: values };
      }
    }

    if (state) {
      where.state = { in: splitCsv(state), mode: "insensitive" };
    }

    if (city) {
      where.city = { in: splitCsv(city), mode: "insensitive" };
    }

    return where;
  }

  async listPublicFiltered(filters: {
    q?: string;
    workModel?: string;
    seniorityLevel?: string;
    companyName?: string;
    publishedWithin?: "24h" | "3d" | "7d";
    area?: string;
    seniority?: string;
    state?: string;
    city?: string;
    page: number;
    limit: number;
  }) {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;
    const where = this.buildPublicJobsWhere(filters);

    const select = {
      canonicalKey: true,
      city: true,
      company: { select: { name: true, websiteUrl: true } },
      country: true,
      descriptionClean: true,
      descriptionRaw: true,
      employmentType: true,
      enrichment: { select: { technologies: true } },
      firstSeenAt: true,
      id: true,
      lastSeenAt: true,
      locationText: true,
      publishedAtSource: true,
      seniorityLevel: true,
      slug: true,
      sourceJobUrl: true,
      state: true,
      status: true,
      title: true,
      workModel: true,
    } as const;

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        orderBy: [{ lastSeenAt: "desc" }, { updatedAt: "desc" }],
        skip,
        take: limit,
        select,
      }),
      this.database.job.count({ where }),
    ]);

    return { jobs, total, page, limit };
  }

  // Usado pelo Radar (usuário logado com UserRadarProfile): busca vagas
  // ativas com os mesmos filtros de texto/empresa/data da listagem pública,
  // com o enrichment incluído para permitir calcular score em memória. O
  // Radar nunca esconde vagas do usuário — só prioriza por relevância — por
  // isso `jobIds` é opcional: quando omitido, traz todas as vagas ativas
  // que batem com os filtros (igual ao anônimo), sem restringir por
  // compatibilidade de área/senioridade/etc. Sem paginação aqui — o score é
  // calculado e ordenado em memória, a paginação acontece depois disso.
  async listByIdsWithEnrichment(
    jobIds: string[] | null,
    filters: {
      q?: string;
      workModel?: string;
      seniorityLevel?: string;
      companyName?: string;
      publishedWithin?: "24h" | "3d" | "7d";
      area?: string;
      seniority?: string;
      state?: string;
      city?: string;
    },
  ) {
    if (jobIds && jobIds.length === 0) {
      return [];
    }
    const where = this.buildPublicJobsWhere(filters);
    return this.database.job.findMany({
      where: { ...where, ...(jobIds ? { id: { in: jobIds } } : {}) },
      include: {
        enrichment: true,
        company: { select: { name: true, websiteUrl: true } },
      },
    });
  }

  async listPublicFacets(filters?: { state?: string }) {
    const jobs = await this.database.job.findMany({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      select: {
        workModel: true,
        state: true,
        city: true,
        enrichment: { select: { dominantArea: true, seniority: true } },
        company: { select: { name: true } },
      },
    });

    const workModelMap = new Map<string, number>();
    const areaMap = new Map<string, number>();
    const seniorityMap = new Map<string, number>();
    const companyMap = new Map<string, number>();
    const states: Array<string | null> = [];
    const cities: Array<string | null> = [];

    // Cidade é relacionada ao estado selecionado (cascata): com filtro de
    // estado ativo, só entram no facet de cidade as vagas cujo state
    // normaliza pra uma das siglas selecionadas — os outros facets
    // (área/senioridade/modalidade/empresa/estado) continuam globais, sem
    // depender do que já está selecionado em outro dropdown.
    const selectedStateSiglas = filters?.state
      ? new Set(
          splitCsv(filters.state).map((value) => value.trim().toUpperCase()),
        )
      : null;

    for (const job of jobs) {
      if (job.workModel) {
        workModelMap.set(
          job.workModel,
          (workModelMap.get(job.workModel) ?? 0) + 1,
        );
      }
      if (job.enrichment?.dominantArea) {
        areaMap.set(
          job.enrichment.dominantArea,
          (areaMap.get(job.enrichment.dominantArea) ?? 0) + 1,
        );
      }
      // UNKNOWN é "senioridade avaliada e não determinável" (não "sem
      // avaliação") — ainda assim não vira opção de filtro: filtrar por
      // "não especificado" não ajuda o usuário a achar vaga nenhuma.
      if (job.enrichment?.seniority && job.enrichment.seniority !== "UNKNOWN") {
        seniorityMap.set(
          job.enrichment.seniority,
          (seniorityMap.get(job.enrichment.seniority) ?? 0) + 1,
        );
      }
      const co = job.company.name;
      companyMap.set(co, (companyMap.get(co) ?? 0) + 1);
      states.push(job.state);

      if (!selectedStateSiglas) {
        cities.push(job.city);
      } else {
        const jobStateSigla = normalizeState(job.state)?.sigla;
        if (jobStateSigla && selectedStateSiglas.has(jobStateSigla)) {
          cities.push(job.city);
        }
      }
    }

    const toSorted = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count);

    return {
      workModels: toSorted(workModelMap),
      areas: toSorted(areaMap),
      seniorities: toSorted(seniorityMap),
      companies: toSorted(companyMap).slice(0, 20),
      states: buildStateFacets(states).slice(0, 40),
      cities: groupLocationValues(cities).slice(0, 40),
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

  async getByIdWithEnrichment(jobId: string) {
    return this.database.job.findUnique({
      where: { id: jobId },
      include: { enrichment: true },
    });
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
