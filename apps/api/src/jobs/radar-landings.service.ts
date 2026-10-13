import { resolveCompanyDisplayName } from "@earlycv/config/job-display";
import { Inject, Injectable } from "@nestjs/common";
import { JobArea, Prisma, SeniorityLevel } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { normalizeState } from "./geo-normalizer";
import { toCompanySlug } from "./public-job-view";

// Agregados das páginas perenes de SEO do Radar (/radar/area/*,
// /radar/empresa/*, /radar/tecnologia/*, /radar/cidade/*, remotas, júnior,
// estágio e combinações). Tudo é contado no banco — nunca carrega a lista de
// vagas em memória — e só devolve contagens e nomes que já são públicos em
// /radar.
//
// O critério de "vaga pública" espelha PUBLIC_JOB_INTEGRITY_WHERE de
// jobs.service.ts (ativa, título/descrição não vazios, slug, enrichment
// concluído e área diferente de OTHER). radar-landings.e2e-spec.ts confere
// que o total daqui bate com o count do Prisma usando aquele filtro.

export type RadarLandingFilters = {
  area?: string;
  workModel?: string;
  seniority?: string;
  companyName?: string;
  technology?: string;
  city?: string;
  // Sigla da UF (ex.: "SP"). Vagas antigas guardam o nome por extenso, então
  // o filtro aceita as duas grafias.
  state?: string;
};

type CountRow = { value: string | null; count: number };

const JOB_AREA_VALUES = new Set<string>(Object.values(JobArea));
const SENIORITY_VALUES = new Set<string>(Object.values(SeniorityLevel));

// Abaixo disso uma tecnologia/cidade não vira candidata a landing (o web
// decide indexação com o próprio mínimo; aqui é só pra não devolver a cauda
// longa inteira).
const INDEX_MIN_TECH_JOBS = 10;
const INDEX_MIN_CITY_JOBS = 5;
const INDEX_MAX_TECHNOLOGIES = 80;
const INDEX_MAX_CITIES = 40;
const SUMMARY_TOP = 8;

const publicJobsFromSql = Prisma.sql`
  FROM "Job" j
  JOIN "JobEnrichment" e ON e."jobId" = j.id
  JOIN "Company" c ON c.id = j."companyId"`;

const publicJobsWhereSql = Prisma.sql`
  WHERE j.status = 'active'
    AND j.title <> ''
    AND j."descriptionClean" <> ''
    AND j.slug IS NOT NULL
    AND e."enrichmentStatus" = 'COMPLETED'
    AND e."dominantArea" <> 'OTHER'`;

const ACCENTED = "áàâãäéèêëíìîïóòôõöúùûüç";
const UNACCENTED = "aaaaaeeeeiiiiooooouuuuc";

function unaccentLower(value: Prisma.Sql): Prisma.Sql {
  return Prisma.sql`translate(lower(trim(${value})), ${ACCENTED}, ${UNACCENTED})`;
}

function stateVariants(sigla: string): string[] {
  const normalized = normalizeState(sigla);
  if (!normalized) return [sigla.toUpperCase()];
  return [normalized.sigla, normalized.nome.toUpperCase()];
}

export function buildLandingFiltersSql(
  filters: RadarLandingFilters,
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [];

  if (filters.area && JOB_AREA_VALUES.has(filters.area)) {
    conditions.push(Prisma.sql`e."dominantArea"::text = ${filters.area}`);
  }
  if (filters.seniority && SENIORITY_VALUES.has(filters.seniority)) {
    conditions.push(Prisma.sql`e.seniority::text = ${filters.seniority}`);
  }
  if (filters.workModel) {
    conditions.push(Prisma.sql`j."workModel" = ${filters.workModel}`);
  }
  if (filters.companyName) {
    conditions.push(Prisma.sql`lower(c.name) = lower(${filters.companyName})`);
  }
  if (filters.technology) {
    const tech = filters.technology.toLowerCase();
    conditions.push(
      Prisma.sql`(${tech} = ANY(e.technologies) OR ${tech} = ANY(e."requiredSkills"))`,
    );
  }
  if (filters.city) {
    // Sem caixa e sem acento: vagas antigas têm "sao paulo" e as novas
    // "São Paulo" (o agrupamento de groupCities usa a mesma regra).
    conditions.push(
      Prisma.sql`${unaccentLower(Prisma.sql`j.city`)} = ${unaccentLower(Prisma.sql`${filters.city}`)}`,
    );
  }
  if (filters.state) {
    conditions.push(
      Prisma.sql`upper(trim(j.state)) IN (${Prisma.join(stateVariants(filters.state))})`,
    );
  }

  if (conditions.length === 0) return Prisma.empty;
  return Prisma.sql` AND ${Prisma.join(conditions, " AND ")}`;
}

function toCounts(rows: CountRow[]) {
  return rows
    .filter((row): row is { value: string; count: number } => !!row.value)
    .map((row) => ({ value: row.value, count: Number(row.count) }));
}

// Cidades: Job.city é texto livre (title case a partir da normalização da
// ingestão, cru nas vagas antigas) e Job.state mistura sigla e nome. Agrupa
// por (cidade sem caixa, UF normalizada) e descarta o que não é UF
// brasileira — é daí que vinha o lixo ("Armazem 9", "Remote; Germany").
function groupCities(
  rows: Array<{ city: string | null; state: string | null; count: number }>,
) {
  const groups = new Map<
    string,
    {
      city: string;
      state: string;
      stateName: string;
      count: number;
      spellings: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const city = row.city?.trim();
    const uf = normalizeState(row.state);
    if (!city || !uf) continue;
    // Modalidade/país gravados no campo de cidade não são cidade.
    if (
      /^(remoto|remote|brasil|brazil|home office|hibrido|híbrido)$/i.test(city)
    )
      continue;
    const key = `${toCompanySlug(city)}|${uf.sigla}`;
    const count = Number(row.count);
    const group = groups.get(key) ?? {
      city,
      state: uf.sigla,
      stateName: uf.nome,
      count: 0,
      spellings: new Map<string, number>(),
    };
    group.count += count;
    group.spellings.set(city, (group.spellings.get(city) ?? 0) + count);
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      // Grafia mais usada; no empate, a que não está toda em minúscula
      // ("São Paulo" antes de "sao paulo").
      const [display] = [...group.spellings.entries()].sort(
        (a, b) =>
          b[1] - a[1] ||
          Number(a[0] === a[0].toLowerCase()) -
            Number(b[0] === b[0].toLowerCase()),
      )[0] as [string, number];
      return {
        city: display,
        state: group.state,
        stateName: group.stateName,
        slug: `${toCompanySlug(display)}-${group.state.toLowerCase()}`,
        count: group.count,
        // Todas as grafias do banco — a listagem (Prisma, `in` sem caixa)
        // precisa delas para casar as vagas antigas sem acento.
        spellings: [...group.spellings.keys()],
      };
    })
    .sort((a, b) => b.count - a.count);
}

@Injectable()
export class RadarLandingsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  private countBy(column: Prisma.Sql, filtersSql: Prisma.Sql) {
    return this.database.$queryRaw<CountRow[]>`
      SELECT ${column} AS value, count(*)::int AS count
      ${publicJobsFromSql} ${publicJobsWhereSql} ${filtersSql}
      GROUP BY 1
      ORDER BY 2 DESC`;
  }

  private countPairs(
    first: Prisma.Sql,
    second: Prisma.Sql,
  ): Promise<Array<{ a: string | null; b: string | null; count: number }>> {
    return this.database.$queryRaw`
      SELECT ${first} AS a, ${second} AS b, count(*)::int AS count
      ${publicJobsFromSql} ${publicJobsWhereSql}
      GROUP BY 1, 2`;
  }

  private async countCompanies(filtersSql: Prisma.Sql, limit?: number) {
    const rows = await this.database.$queryRaw<
      Array<{ name: string; displayName: string | null; count: number }>
    >`
      SELECT c.name AS name, c."displayName" AS "displayName", count(*)::int AS count
      ${publicJobsFromSql} ${publicJobsWhereSql} ${filtersSql}
      GROUP BY c.id, c.name, c."displayName"
      ORDER BY 3 DESC, 1 ASC
      ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}`;
    return rows.map((row) => ({
      displayName: resolveCompanyDisplayName({
        displayName: row.displayName,
        name: row.name.trim(),
      }),
      name: row.name.trim(),
      slug: toCompanySlug(row.name),
      count: Number(row.count),
    }));
  }

  // Tecnologias candidatas vêm de `technologies` (stack de verdade);
  // `requiredSkills` mistura soft skills ("comunicação"), então só entra na
  // contagem — igual ao filtro da landing, que casa nas duas listas.
  private async countTechnologies(
    filtersSql: Prisma.Sql,
    options: { min: number; limit: number },
  ) {
    const rows = await this.database.$queryRaw<CountRow[]>`
      WITH pub AS (
        SELECT j.id, e.technologies, e."requiredSkills"
        ${publicJobsFromSql} ${publicJobsWhereSql} ${filtersSql}
      ),
      job_techs AS (
        SELECT DISTINCT p.id, t.tech
        FROM pub p, unnest(p.technologies || p."requiredSkills") AS t(tech)
      ),
      candidates AS (
        SELECT DISTINCT t.tech
        FROM pub p, unnest(p.technologies) AS t(tech)
        WHERE t.tech <> ''
      )
      SELECT jt.tech AS value, count(*)::int AS count
      FROM job_techs jt
      JOIN candidates c ON c.tech = jt.tech
      GROUP BY jt.tech
      HAVING count(*) >= ${options.min}
      ORDER BY 2 DESC, 1 ASC
      LIMIT ${options.limit}`;
    return toCounts(rows);
  }

  private async countCities(filtersSql: Prisma.Sql) {
    const rows = await this.database.$queryRaw<
      Array<{ city: string | null; state: string | null; count: number }>
    >`
      SELECT j.city AS city, j.state AS state, count(*)::int AS count
      ${publicJobsFromSql} ${publicJobsWhereSql} ${filtersSql}
        AND j.city IS NOT NULL
      GROUP BY 1, 2`;
    return groupCities(rows);
  }

  // Índice de todas as landings possíveis com o volume atual — alimenta o
  // sitemap, os links internos ("Explore vagas por...") e a resolução de
  // slug de empresa/cidade pro nome real.
  async getIndex() {
    const none = Prisma.empty;
    const [
      [totalRow],
      areas,
      seniorities,
      workModels,
      companies,
      technologies,
      cities,
      areaWorkModels,
      areaSeniorities,
      seniorityWorkModels,
    ] = await Promise.all([
      this.database.$queryRaw<Array<{ count: number }>>`
        SELECT count(*)::int AS count
        ${publicJobsFromSql} ${publicJobsWhereSql}`,
      this.countBy(Prisma.sql`e."dominantArea"::text`, none),
      this.countBy(Prisma.sql`e.seniority::text`, none),
      this.countBy(Prisma.sql`j."workModel"`, none),
      this.countCompanies(none),
      this.countTechnologies(none, {
        min: INDEX_MIN_TECH_JOBS,
        limit: INDEX_MAX_TECHNOLOGIES,
      }),
      this.countCities(none),
      this.countPairs(
        Prisma.sql`e."dominantArea"::text`,
        Prisma.sql`j."workModel"`,
      ),
      this.countPairs(
        Prisma.sql`e."dominantArea"::text`,
        Prisma.sql`e.seniority::text`,
      ),
      this.countPairs(Prisma.sql`e.seniority::text`, Prisma.sql`j."workModel"`),
    ]);

    const pairs = (
      rows: Array<{ a: string | null; b: string | null; count: number }>,
    ) =>
      rows
        .filter((row) => row.a && row.b)
        .map((row) => ({
          a: row.a as string,
          b: row.b as string,
          count: Number(row.count),
        }))
        .sort((x, y) => y.count - x.count);

    return {
      total: Number(totalRow?.count ?? 0),
      areas: toCounts(areas),
      seniorities: toCounts(seniorities),
      workModels: toCounts(workModels),
      companies,
      technologies,
      cities: cities
        .filter((city) => city.count >= INDEX_MIN_CITY_JOBS)
        .slice(0, INDEX_MAX_CITIES),
      areaWorkModels: pairs(areaWorkModels),
      areaSeniorities: pairs(areaSeniorities),
      seniorityWorkModels: pairs(seniorityWorkModels),
    };
  }

  // Panorama de uma landing (um recorte de filtros): base do texto próprio
  // da página, do título com contagem e da decisão de indexação.
  async getSummary(filters: RadarLandingFilters) {
    const filtersSql = buildLandingFiltersSql(filters);
    const [
      [totals],
      companies,
      technologies,
      workModels,
      seniorities,
      areas,
      cities,
    ] = await Promise.all([
      this.database.$queryRaw<
        Array<{ count: number; latestAt: Date | null; last7d: number }>
      >`
        SELECT count(*)::int AS count,
               max(coalesce(j."publishedAtSource", j."firstSeenAt")) AS "latestAt",
               (count(*) FILTER (
                 WHERE coalesce(j."publishedAtSource", j."firstSeenAt")
                   >= now() - interval '7 days'
               ))::int AS last7d
        ${publicJobsFromSql} ${publicJobsWhereSql} ${filtersSql}`,
      this.countCompanies(filtersSql, SUMMARY_TOP),
      this.countTechnologies(filtersSql, { min: 1, limit: SUMMARY_TOP + 2 }),
      this.countBy(Prisma.sql`j."workModel"`, filtersSql),
      this.countBy(Prisma.sql`e.seniority::text`, filtersSql),
      this.countBy(Prisma.sql`e."dominantArea"::text`, filtersSql),
      this.countCities(filtersSql),
    ]);

    return {
      total: Number(totals?.count ?? 0),
      latestAt: totals?.latestAt ? totals.latestAt.toISOString() : null,
      newLast7Days: Number(totals?.last7d ?? 0),
      companies,
      technologies,
      workModels: toCounts(workModels),
      seniorities: toCounts(seniorities),
      areas: toCounts(areas),
      cities: cities.slice(0, SUMMARY_TOP),
    };
  }
}
