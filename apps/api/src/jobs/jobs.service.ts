import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  JobArea,
  type JobStatus,
  Prisma,
  SeniorityLevel,
} from "@prisma/client";

import { CompaniesService } from "../companies/companies.service";
import { DatabaseService } from "../database/database.service";
import { JobSourcesService } from "../job-sources/job-sources.service";
import { formatCompanyDisplayName } from "./company-display-name";
import type { CreateJobDto } from "./dto/create-job.dto";
import type { UpdateJobDto } from "./dto/update-job.dto";
import { normalizeState } from "./geo-normalizer";
import { toCompanySlug } from "./public-job-view";

const PUBLIC_JOB_SELECT = {
  canonicalKey: true,
  city: true,
  company: {
    select: {
      name: true,
      websiteUrl: true,
      logoUrl: true,
    },
  },
  country: true,
  descriptionClean: true,
  descriptionRaw: true,
  employmentType: true,
  enrichment: { select: { technologies: true, dominantArea: true } },
  externalJobId: true,
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
  //
  // dominantArea=OTHER ("Geral" no filtro) é o catch-all do LLM pra vaga
  // fora da taxonomia tech (RH, jurídico, engenharia não-tech etc.) — boards
  // globais (Workday/Greenhouse) trazem essas vagas junto com as tech de
  // verdade. Decisão de produto: não é o público do radar, nunca aparece no
  // portal (nem listagem, nem facet, nem /radar/[slug] direto).
  enrichment: {
    enrichmentStatus: "COMPLETED",
    dominantArea: { not: "OTHER" },
  },
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
      const [display] = [...originals.entries()].sort(
        (a, b) => b[1] - a[1],
      )[0] as [string, number];
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
    dominantAreaFilter?: string;
    radarVisibilityFilter?: string;
  }) {
    const page = params.page ?? 1;
    const pageSize = params.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.JobWhereInput = {};
    const and: Prisma.JobWhereInput[] = [];

    if (params.search) {
      const term = params.search;
      and.push({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { locationText: { contains: term, mode: "insensitive" } },
          { company: { name: { contains: term, mode: "insensitive" } } },
        ],
      });
    }

    if (params.sourceFilter) {
      where.jobSource = {
        sourceName: { contains: params.sourceFilter, mode: "insensitive" },
      };
    }

    if (params.statusFilter) {
      where.status = params.statusFilter as Prisma.EnumJobStatusFilter;
    }

    // "sem-enriquecimento" = nenhuma linha JobEnrichment ainda (worker não
    // rodou); demais valores filtram por dominantArea, inclusive OTHER —
    // usado pra investigar vagas classificadas fora da taxonomia tech.
    if (params.dominantAreaFilter === "sem-enriquecimento") {
      where.enrichment = null;
    } else if (params.dominantAreaFilter) {
      where.enrichment = {
        dominantArea: params.dominantAreaFilter as JobArea,
      };
    }

    // Reflete exatamente PUBLIC_JOB_INTEGRITY_WHERE — "oculta" é o
    // complemento lógico de "visivel", pra diagnosticar por que uma vaga
    // "active" não aparece no /radar.
    if (params.radarVisibilityFilter === "visivel") {
      where.status = "active";
      where.descriptionClean = { not: "" };
      where.title = { not: "" };
      where.slug = { not: null };
      where.enrichment = {
        enrichmentStatus: "COMPLETED",
        dominantArea: { not: "OTHER" },
      };
    } else if (params.radarVisibilityFilter === "oculta") {
      where.status = "active";
      and.push({
        OR: [
          { descriptionClean: "" },
          { title: "" },
          { slug: null },
          { enrichment: null },
          { enrichment: { enrichmentStatus: { not: "COMPLETED" } } },
          { enrichment: { dominantArea: "OTHER" } },
        ],
      });
    }

    if (and.length > 0) {
      where.AND = and;
    }

    const [jobs, total] = await Promise.all([
      this.database.job.findMany({
        where,
        include: {
          company: { select: { name: true } },
          enrichment: {
            select: { dominantArea: true, enrichmentStatus: true },
          },
        },
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
      select: { slug: true, lastSeenAt: true, contentUpdatedAt: true },
      orderBy: { lastSeenAt: "desc" },
    });

    return jobs.filter(
      (
        job,
      ): job is {
        slug: string;
        lastSeenAt: Date;
        contentUpdatedAt: Date | null;
      } => job.slug !== null,
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

  // Usado por /radar/[slug] e /radar/[slug]/score — query direta pelo campo
  // slug (indexado e único), no lugar de carregar listPublic() inteiro e
  // fazer Array.find recalculando o slug de cada vaga.
  async getPublicBySlug(slug: string) {
    return this.database.job.findFirst({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE, slug },
      select: PUBLIC_JOB_SELECT,
    });
  }

  // Usado por /radar/empresa/[empresa]. Company não tem campo de slug
  // persistido, então o casamento é feito em memória: pega o nome de cada
  // empresa com pelo menos 1 vaga pública, computa o slug (toCompanySlug,
  // mesma função usada pelo slug de vaga) e compara com o da URL. Só depois
  // de achar a empresa é que a segunda query busca as vagas de verdade —
  // evita escanear a tabela Company inteira (só quem tem vaga pública entra
  // na primeira query).
  async getPublicByCompanySlug(companySlug: string) {
    const activeJobCompanies = await this.database.job.findMany({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      select: { companyId: true, company: { select: { name: true } } },
      distinct: ["companyId"],
    });

    const match = activeJobCompanies.find(
      (job) => toCompanySlug(job.company.name) === companySlug,
    );

    if (!match) {
      return null;
    }

    const jobs = await this.database.job.findMany({
      where: {
        status: "active",
        ...PUBLIC_JOB_INTEGRITY_WHERE,
        companyId: match.companyId,
      },
      select: PUBLIC_JOB_SELECT,
      orderBy: [{ lastSeenAt: "desc" }],
    });

    return { companyName: match.company.name, jobs };
  }

  // Usado pela landing page (marquee de empresas) — mesma lógica de
  // "empresa com pelo menos 1 vaga pública" de getPublicByCompanySlug, mas
  // devolvendo as N empresas com mais vagas ativas em vez de resolver uma
  // única empresa por slug. Nunca mostra empresa sem vaga ativa/pública.
  async listTopCompaniesWithActiveJobs(limit: number) {
    const activeJobs = await this.database.job.findMany({
      where: { status: "active", ...PUBLIC_JOB_INTEGRITY_WHERE },
      select: {
        companyId: true,
        company: { select: { name: true, logoUrl: true } },
      },
    });

    const byCompany = new Map<
      string,
      { name: string; logoUrl: string | null; jobCount: number }
    >();
    for (const job of activeJobs) {
      const existing = byCompany.get(job.companyId);
      if (existing) {
        existing.jobCount += 1;
      } else {
        byCompany.set(job.companyId, {
          name: job.company.name,
          logoUrl: job.company.logoUrl,
          jobCount: 1,
        });
      }
    }

    return [...byCompany.values()]
      .sort((a, b) => b.jobCount - a.jobCount)
      .slice(0, limit)
      .map((company) => ({
        name: formatCompanyDisplayName(company.name),
        slug: toCompanySlug(company.name),
        logoUrl: company.logoUrl,
        jobCount: company.jobCount,
      }));
  }

  // Usado por /radar/tecnologia/[tech]. Threshold de volume: só existe
  // conteúdo publicável na landing page se houver pelo menos `minCount`
  // vagas ativas com essa tecnologia — abaixo disso o chamador (route)
  // decide fazer notFound(). requiredSkills/technologies do enrichment já
  // chegam normalizados em lowercase (ver job-enrichment.worker.ts), e o
  // controller já lowercasa o param da URL antes de chamar — `has` do
  // Prisma em array Postgres é comparação exata, então sem isso o match
  // seria case-sensitive.
  async listPublicJobsByTech(tech: string, minCount: number) {
    const enrichmentWhere: Prisma.JobEnrichmentWhereInput = {
      ...PUBLIC_JOB_INTEGRITY_WHERE.enrichment,
      OR: [{ requiredSkills: { has: tech } }, { technologies: { has: tech } }],
    };
    const where: Prisma.JobWhereInput = {
      status: "active",
      ...PUBLIC_JOB_INTEGRITY_WHERE,
      enrichment: enrichmentWhere,
    };

    const total = await this.database.job.count({ where });
    if (total < minCount) {
      return { total, jobs: [] };
    }

    const jobs = await this.database.job.findMany({
      where,
      select: PUBLIC_JOB_SELECT,
      orderBy: [{ lastSeenAt: "desc" }],
    });

    return { total, jobs };
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
    technology?: string;
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
      technology,
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
      // Filtra "OTHER" fora mesmo se vier explícito na query (?area=OTHER)
      // — senão o `in: values` abaixo substitui o `not: "OTHER"` herdado de
      // PUBLIC_JOB_INTEGRITY_WHERE.enrichment e reabriria a categoria só
      // por causa da URL.
      const values = splitEnumCsv(area, JOB_AREA_VALUES).filter(
        (value) => value !== "OTHER",
      );
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

    // Usado por /radar/tecnologia/[tech] (fixedFilters.technology, ver
    // jobs-listing.tsx no web) — requiredSkills/technologies do enrichment
    // já chegam normalizados em lowercase (job-enrichment.worker.ts), e o
    // controller já lowercasa `technology` antes de chegar aqui, então o
    // `has` do Prisma (comparação exata em array Postgres) funciona sem
    // gambiarra de case-insensitivity.
    if (technology) {
      enrichmentWhere.OR = [
        { requiredSkills: { has: technology } },
        { technologies: { has: technology } },
      ];
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
    technology?: string;
    page: number;
    limit: number;
  }) {
    const { page, limit } = filters;
    const skip = (page - 1) * limit;
    const where = this.buildPublicJobsWhere(filters);

    const select = {
      canonicalKey: true,
      city: true,
      company: { select: { name: true, websiteUrl: true, logoUrl: true } },
      country: true,
      descriptionClean: true,
      descriptionRaw: true,
      employmentType: true,
      enrichment: { select: { technologies: true, dominantArea: true } },
      externalJobId: true,
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
        // publishedAtSource e a data da vaga em si (reportada pela fonte);
        // cai pro lastSeenAt (data de captura) so quando a fonte nao
        // informa data de publicacao.
        orderBy: [
          { publishedAtSource: { sort: "desc", nulls: "last" } },
          { lastSeenAt: "desc" },
          { updatedAt: "desc" },
        ],
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
      technology?: string;
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
        company: { select: { name: true, websiteUrl: true, logoUrl: true } },
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
      // Sem cap: o dropdown de empresa no /radar agora tem busca por texto
      // (filters-bar.tsx), então cortar em 20 escondia empresa real com
      // vaga visível (ex: Petz) só por não estar entre as 20 com mais
      // vagas — o corte fazia sentido só quando a lista inteira era
      // mostrada sem filtro.
      companies: toSorted(companyMap),
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

  // Correção manual de classificação errada do enrichment (ex: LLM jogou em
  // OTHER uma vaga tech de empresa não-nativamente-tech). O worker de
  // enriquecimento só processa enrichmentStatus=PENDING (ver
  // job-enrichment.worker.ts), então esse override nunca é sobrescrito por
  // um reprocessamento futuro do mesmo job.
  async reclassifyDominantArea(jobId: string, dominantArea: JobArea) {
    const job = await this.database.job.findUnique({
      where: { id: jobId },
      include: { enrichment: true },
    });

    if (!job) {
      throw new NotFoundException("job not found");
    }

    if (!job.enrichment) {
      throw new BadRequestException(
        "job has no enrichment record to reclassify",
      );
    }

    await this.database.jobEnrichment.update({
      where: { jobId },
      data: {
        dominantArea,
        areas: { set: [dominantArea] },
      },
    });

    return this.getByIdWithEnrichment(jobId);
  }

  // Botão "desativar/ativar todas as vagas da fonte" no admin — pra quando
  // a fonte inteira foi cadastrada errada (ex: board Lever global trazendo
  // vaga de outro país que passou pelo filtro isForeignLocation por engano,
  // caso real: LOUIS DREYFUS BR/Romênia) e o volume de vagas já ingeridas
  // torna reclassificar uma a uma inviável.
  async bulkSetStatusByJobSource(jobSourceId: string, status: JobStatus) {
    const jobSource = await this.jobSourcesService.getById(jobSourceId);

    const { count } = await this.database.job.updateMany({
      data: { status },
      where: { jobSourceId: jobSource.id },
    });

    return { count, status } as const;
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
