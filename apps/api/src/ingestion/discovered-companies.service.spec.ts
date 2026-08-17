import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../database/database.service";
import type { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { DiscoveredCompaniesService } from "./discovered-companies.service";
import type { IngestionService } from "./ingestion.service";
import type { WebSearchService } from "./web-search/web-search.service";

type Candidate = {
  id: string;
  name: string;
  normalizedName: string;
  industry?: string | null;
  websiteUrl?: string | null;
  careersUrl?: string | null;
  adapterType?: string | null;
  status: string;
  jobCount: number;
  rawJobCount?: number;
  resolutionMethod?: string | null;
  errorMessage?: string | null;
  checkedAt?: Date | null;
  linkedCompanyId?: string | null;
  batchLabel?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function createFixture(options?: {
  probeImpl?: (
    sourceType: string,
    sourceUrl: string,
  ) => Promise<{
    ok: boolean;
    jobCount: number;
    rawJobCount?: number;
    inconclusive: boolean;
    error?: string;
  }>;
  webSearch?: {
    searchImpl?: (
      query: string,
    ) => Promise<{ title: string; url: string; snippet?: string }[]>;
  };
  importRowImpl?: (row: { nome: string }) => Promise<{
    companyAction: string;
    companyId?: string;
    companyName: string;
    inferredAdapter?: string;
    jobSourceId?: string;
    message: string;
    sourceAction: string;
    status: string;
  }>;
}) {
  const candidates = new Map<string, Candidate>();
  const companies = new Map<string, { id: string; normalizedName: string }>();
  const sources = new Map<
    string,
    { companyId: string; companyName: string; sourceUrl: string }
  >();
  let nextId = 1;

  const database = {
    discoveredCompany: {
      findMany: async ({
        where,
        orderBy: _orderBy,
        take,
      }: {
        where?: { status?: { in?: string[] } | string };
        orderBy?: unknown;
        take?: number;
      } = {}) => {
        let items = [...candidates.values()];
        if (where?.status) {
          if (typeof where.status === "string") {
            items = items.filter((c) => c.status === where.status);
          } else if (where.status.in) {
            items = items.filter((c) => where.status.in?.includes(c.status));
          }
        }
        items = items.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
        return typeof take === "number" ? items.slice(0, take) : items;
      },
      findUnique: async ({
        where,
      }: {
        where: { id?: string; normalizedName?: string };
      }) => {
        if (where.id) return candidates.get(where.id) ?? null;
        return (
          [...candidates.values()].find(
            (c) => c.normalizedName === where.normalizedName,
          ) ?? null
        );
      },
      create: async ({ data }: { data: Partial<Candidate> }) => {
        const id = `candidate-${nextId++}`;
        const now = new Date();
        const candidate: Candidate = {
          adapterType: null,
          careersUrl: null,
          checkedAt: null,
          createdAt: now,
          errorMessage: null,
          id,
          industry: null,
          jobCount: 0,
          linkedCompanyId: null,
          status: "PENDING",
          updatedAt: now,
          websiteUrl: null,
          ...data,
        } as Candidate;
        candidates.set(id, candidate);
        return candidate;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Candidate>;
      }) => {
        const existing = candidates.get(where.id);
        assert.ok(existing);
        const updated = { ...existing, ...data };
        candidates.set(where.id, updated);
        return updated;
      },
    },
    company: {
      findUnique: async ({ where }: { where: { normalizedName: string } }) =>
        companies.get(where.normalizedName) ?? null,
    },
    jobSource: {
      findFirst: async ({ where }: { where: { sourceUrl: string } }) => {
        const source = sources.get(where.sourceUrl);
        if (!source) return null;
        return {
          ...source,
          company: { name: source.companyName },
        };
      },
    },
  } as unknown as DatabaseService;

  const ingestionService = {
    probeSource: async (sourceType: string, sourceUrl: string) => {
      const result = options?.probeImpl
        ? await options.probeImpl(sourceType, sourceUrl)
        : { inconclusive: false, jobCount: 0, ok: true };
      return { rawJobCount: result.jobCount, ...result };
    },
  } as unknown as IngestionService;

  const importRowCalls: unknown[] = [];
  const importService = {
    importRow: async (row: { nome: string }) => {
      importRowCalls.push(row);
      if (options?.importRowImpl) return options.importRowImpl(row);
      return {
        companyAction: "created",
        companyId: "company-1",
        companyName: row.nome,
        inferredAdapter: "gupy",
        jobSourceId: "source-1",
        message: "company and source processed",
        sourceAction: "created",
        status: "success",
      };
    },
  } as unknown as AdminIngestionImportService;

  const webSearchService = {
    isEnabled: () => Boolean(options?.webSearch),
    search: async (query: string) =>
      options?.webSearch?.searchImpl?.(query) ?? [],
  } as unknown as WebSearchService;

  const service = new DiscoveredCompaniesService(
    database,
    ingestionService,
    importService,
    webSearchService,
  );

  return {
    candidates,
    companies,
    importRowCalls,
    importService,
    service,
    sources,
  };
}

test("list() nunca trunca candidatos promovíveis mesmo com PENDING mais recente lotando o corte de 500", async () => {
  const { service, candidates } = createFixture();
  const base = new Date("2026-08-16T22:16:18.000Z").getTime();

  for (let i = 0; i < 139; i++) {
    candidates.set(`validated-${i}`, {
      adapterType: "gupy",
      careersUrl: `https://empresa-${i}.gupy.io`,
      checkedAt: new Date(base + i),
      createdAt: new Date(base + i),
      id: `validated-${i}`,
      industry: null,
      jobCount: 3,
      name: `Empresa Validada ${i}`,
      normalizedName: `empresa validada ${i}`,
      status: "VALIDATED",
      updatedAt: new Date(base + i),
    });
  }
  // PENDINGs criados minutos depois — em volume bem maior que o corte de 500.
  for (let i = 0; i < 600; i++) {
    candidates.set(`pending-${i}`, {
      createdAt: new Date(base + 1_000 + i),
      id: `pending-${i}`,
      industry: null,
      jobCount: 0,
      name: `Empresa Pendente ${i}`,
      normalizedName: `empresa pendente ${i}`,
      status: "PENDING",
      updatedAt: new Date(base + 1_000 + i),
    });
  }

  const rows = await service.list([
    "PENDING",
    "VALIDATED",
    "NO_ACTIVE_JOBS",
    "NO_TECH_JOBS",
  ] as never);

  const validatedRows = rows.filter((r) => r.status === "VALIDATED");
  assert.equal(validatedRows.length, 139);
});

test("importCandidatesCsv (formato simples) cria PENDING sem URL/adapter", async () => {
  const { service, candidates } = createFixture();

  const report = await service.importCandidatesCsv({
    csvText: "nome\nBanco Safra\nMagazine Luiza",
  });

  assert.equal(report.createdCount, 2);
  assert.equal(report.skippedCount, 0);
  assert.equal(report.errorCount, 0);
  const created = [...candidates.values()];
  assert.equal(created[0]?.status, "PENDING");
  assert.equal(created[0]?.careersUrl, null);
});

test("importCandidatesCsv decodifica entidades HTML no nome (ex: copiado de pagina web)", async () => {
  const { service, candidates } = createFixture();

  const report = await service.importCandidatesCsv({
    csvText: "nome\nSuperl&#243;gica\nAssa&#237; Tech",
  });

  assert.equal(report.createdCount, 2);
  const created = [...candidates.values()];
  assert.equal(created[0]?.name, "Superlógica");
  assert.equal(created[0]?.normalizedName, "superlogica");
  assert.equal(created[1]?.name, "Assaí Tech");
});

test("importCandidatesCsv (formato completo) grava careers_url/adapter e não duplica", async () => {
  const { service, candidates } = createFixture();

  const report = await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\n" +
      "Banco Safra,Financeiro,https://safra.com.br,https://bancosafra.gupy.io,gupy",
  });

  assert.equal(report.createdCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.adapterType, "gupy");
  assert.equal(candidate?.careersUrl, "https://bancosafra.gupy.io/");

  // Reimportar a mesma planilha não recria/reseta a linha.
  const secondReport = await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\n" +
      "Banco Safra,Financeiro,https://safra.com.br,https://bancosafra.gupy.io,gupy",
  });
  assert.equal(secondReport.createdCount, 0);
  assert.equal(secondReport.skippedCount, 1);
  assert.equal(candidates.size, 1);
});

test("importCandidatesCsv pula nome que já é Company de verdade", async () => {
  const { service, companies } = createFixture();
  companies.set("banco-safra", {
    id: "company-x",
    normalizedName: "banco-safra",
  });

  const report = await service.importCandidatesCsv({
    csvText: "nome\nBanco Safra",
  });

  assert.equal(report.createdCount, 0);
  assert.equal(report.skippedCount, 1);
});

test("validatePending (URL conhecida) marca VALIDATED quando o probe acha vagas", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 5, ok: true }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nEmpresa X,,,https://x.gupy.io,gupy",
  });

  const report = await service.validatePending();

  assert.equal(report.validatedCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "VALIDATED");
  assert.equal(candidate?.jobCount, 5);
});

test("validatePending (URL conhecida) marca NO_ACTIVE_JOBS quando o probe não acha vagas", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 0, ok: true }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nEmpresa X,,,https://x.gupy.io,gupy",
  });

  await service.validatePending();

  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "NO_ACTIVE_JOBS");
});

test("validatePending (URL conhecida) marca NO_TECH_JOBS quando o board tem vagas mas nenhuma passa no filtro semantico", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({
      inconclusive: false,
      jobCount: 0,
      ok: true,
      rawJobCount: 11,
    }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nUsiminas,,,https://usiminas.gupy.io,gupy",
  });

  const report = await service.validatePending();

  assert.equal(report.noTechJobsCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "NO_TECH_JOBS");
  assert.equal(candidate?.jobCount, 0);
  assert.equal(candidate?.rawJobCount, 11);
});

test("validatePending (URL conhecida) marca INVALID em erro estrutural e mantém PENDING em erro inconclusivo", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({
      error: "gupy board is unavailable",
      inconclusive: false,
      jobCount: 0,
      ok: false,
    }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nEmpresa X,,,https://x.gupy.io,gupy",
  });
  await service.validatePending();
  assert.equal([...candidates.values()][0]?.status, "INVALID");

  const { service: service2, candidates: candidates2 } = createFixture({
    probeImpl: async () => ({
      error: "forbidden",
      inconclusive: true,
      jobCount: 0,
      ok: false,
    }),
  });
  await service2.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nEmpresa Y,,,https://y.gupy.io,gupy",
  });
  const report2 = await service2.validatePending();
  assert.equal(report2.stillPendingCount, 1);
  assert.equal([...candidates2.values()][0]?.status, "PENDING");
});

test("validateOne se auto-cura: careersUrl conhecida quebrada cai pra busca web em vez de marcar INVALID direto", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async (sourceType, sourceUrl) => {
      // A URL "conhecida" (pré-preenchida errada, ex: chute salvo antes da
      // busca web existir) sempre falha — só a resolvida pela busca funciona.
      if (sourceUrl === "https://assai.gupy.io") {
        return { inconclusive: false, jobCount: 5, ok: true };
      }
      return {
        error: "gupy board is unavailable",
        inconclusive: false,
        jobCount: 0,
        ok: false,
      };
    },
    webSearch: {
      searchImpl: async () => [
        { title: "Trabalhe conosco | Assaí", url: "https://assai.gupy.io/" },
      ],
    },
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nAssaí Tech,,,https://assaitech.gupy.io,gupy",
  });
  const candidate = [...candidates.values()][0];

  const revalidated = await service.validateOne(candidate.id);

  assert.equal(revalidated.status, "VALIDATED");
  assert.equal(revalidated.careersUrl, "https://assai.gupy.io");
  assert.equal(revalidated.resolutionMethod, "web_search");
});

test("validatePending (só nome) acha match chutando slug num dos adapters adivináveis", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async (sourceType, sourceUrl) => {
      if (sourceType === "greenhouse" && sourceUrl.includes("empresax")) {
        return { inconclusive: false, jobCount: 3, ok: true };
      }
      return { inconclusive: false, jobCount: 0, ok: true };
    },
  });
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa X" });

  const report = await service.validatePending(100);

  assert.equal(report.validatedCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "VALIDATED");
  assert.equal(candidate?.adapterType, "greenhouse");
  assert.ok(candidate?.careersUrl?.includes("greenhouse.io"));
});

test("resolveViaWebSearch restringe a busca aos domínios de adapter conhecidos (site:) — nunca deixa a busca livre", async () => {
  // Regressão: "{nome} vagas" sem filtro de site perdia pro board de
  // verdade com frequência (a pagina institucional de carreiras rankeia
  // acima do board de ATS real — casos reais: Banco Agibank, Banco
  // Mercantil do Brasil). O filtro site: garante que só resultado
  // hospedado num adapter conhecido pode aparecer.
  let capturedQuery = "";
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 2, ok: true }),
    webSearch: {
      searchImpl: async (query) => {
        capturedQuery = query;
        return [{ title: "Agibank", url: "https://boards.greenhouse.io/agibank" }];
      },
    },
  });
  await service.importCandidatesCsv({ csvText: "nome\nBanco Agibank" });

  await service.validatePending();

  assert.ok(capturedQuery.includes("Banco Agibank"));
  assert.ok(capturedQuery.includes("site:gupy.io"));
  assert.ok(capturedQuery.includes("site:job-boards.greenhouse.io"));
  assert.ok(capturedQuery.includes("site:myworkdayjobs.com"));
  assert.equal([...candidates.values()][0]?.status, "VALIDATED");
});

test("validatePending (só nome) resolve via busca web sem precisar chutar slug", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async (sourceType, sourceUrl) => {
      if (sourceType === "gupy" && sourceUrl === "https://venhasersafra.gupy.io") {
        return { inconclusive: false, jobCount: 5, ok: true };
      }
      return { inconclusive: false, jobCount: 0, ok: true };
    },
    webSearch: {
      searchImpl: async () => [
        { title: "Site institucional", url: "https://safra.com.br" },
        {
          snippet: "Vagas abertas no Banco Safra",
          title: "Trabalhe conosco",
          url: "https://venhasersafra.gupy.io/",
        },
      ],
    },
  });
  await service.importCandidatesCsv({ csvText: "nome\nBanco Safra" });

  const report = await service.validatePending(100);

  assert.equal(report.validatedCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "VALIDATED");
  assert.equal(candidate?.adapterType, "gupy");
  assert.equal(candidate?.careersUrl, "https://venhasersafra.gupy.io");
  assert.equal(candidate?.resolutionMethod, "web_search");
});

test("validatePending (só nome) cai pro chute de slug quando a busca web não acha nada", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async (sourceType, sourceUrl) => {
      if (sourceType === "greenhouse" && sourceUrl.includes("empresax")) {
        return { inconclusive: false, jobCount: 3, ok: true };
      }
      return { inconclusive: false, jobCount: 0, ok: true };
    },
    webSearch: {
      searchImpl: async () => [
        { title: "LinkedIn", url: "https://linkedin.com/company/empresa-x" },
      ],
    },
  });
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa X" });

  const report = await service.validatePending(100);

  assert.equal(report.validatedCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "VALIDATED");
  assert.equal(candidate?.resolutionMethod, "slug_guess");
});

test("validatePending dá busca web pra cada candidato do lote (orçamento não é compartilhado entre eles)", async () => {
  let searchCalls = 0;
  const { service, candidates } = createFixture({
    probeImpl: async (sourceType, sourceUrl) => {
      if (sourceUrl === "https://empresa-a.gupy.io") {
        return { inconclusive: false, jobCount: 2, ok: true };
      }
      if (sourceUrl === "https://empresa-b.gupy.io") {
        return { inconclusive: false, jobCount: 4, ok: true };
      }
      return { inconclusive: false, jobCount: 0, ok: true };
    },
    webSearch: {
      searchImpl: async (query) => {
        searchCalls += 1;
        if (query.includes("Empresa A")) {
          return [{ title: "A", url: "https://empresa-a.gupy.io/" }];
        }
        return [{ title: "B", url: "https://empresa-b.gupy.io/" }];
      },
    },
  });
  await service.importCandidatesCsv({
    csvText: "nome\nEmpresa A\nEmpresa B",
  });

  const report = await service.validatePending();

  assert.equal(searchCalls, 2);
  assert.equal(report.validatedCount, 2);
  for (const candidate of candidates.values()) {
    assert.equal(candidate.resolutionMethod, "web_search");
  }
});

test("validatePending(limit) processa só os N primeiros candidatos pendentes e para", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 1, ok: true }),
    webSearch: { searchImpl: async () => [] },
  });
  await service.importCandidatesCsv({
    csvText: "nome\nEmpresa A\nEmpresa B\nEmpresa C",
  });

  const report = await service.validatePending(1);

  assert.equal(report.checkedCount, 1);
  const statuses = [...candidates.values()].map((c) => c.status);
  assert.equal(statuses.filter((s) => s === "PENDING").length, 2);
});

test("validatePending (só nome) marca INVALID com o histórico de tentativas quando nada bate", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 0, ok: true }),
  });
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa Sem Match" });

  const report = await service.validatePending(100);

  assert.equal(report.invalidCount, 1);
  const candidate = [...candidates.values()][0];
  assert.equal(candidate?.status, "INVALID");
  assert.ok(candidate?.errorMessage?.includes("tried:"));
});

test("promote não duplica fonte quando a URL resolvida já está registrada sob outra company (nomes diferentes, mesma URL)", async () => {
  // Cenário real: "Usiminas Tech" nunca foi importado com URL conhecida —
  // foi resolvido depois (busca/chute) pra uma URL que já é a fonte de uma
  // company com nome diferente ("Usiminas"). O dedup do importRow (escopado
  // por companyId) não pegaria isso; o novo check em importCandidateAsSource
  // pega, porque busca por sourceUrl sem escopo de company.
  const { service, candidates, sources, importRowCalls } = createFixture();
  sources.set("https://usiminas.gupy.io/", {
    companyId: "company-usiminas",
    companyName: "Usiminas",
    sourceUrl: "https://usiminas.gupy.io/",
  });

  await service.importCandidatesCsv({ csvText: "nome\nUsiminas Tech" });
  const candidate = [...candidates.values()][0];
  await candidates.set(candidate.id, {
    ...candidate,
    adapterType: "gupy",
    careersUrl: "https://usiminas.gupy.io/",
    status: "VALIDATED",
  });

  const promoted = await service.promote(candidate.id);

  assert.equal(promoted.status, "IMPORTED");
  assert.equal(promoted.linkedCompanyId, "company-usiminas");
  assert.ok(promoted.errorMessage?.includes("Usiminas"));
  assert.equal(importRowCalls.length, 0);
});

test("promote exige status VALIDATED e marca IMPORTED em caso de sucesso", async () => {
  const { service, candidates, importRowCalls } = createFixture();
  const created = await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nEmpresa X,,,https://x.gupy.io,gupy",
  });
  assert.equal(created.createdCount, 1);
  const candidate = [...candidates.values()][0];

  await assert.rejects(() => service.promote(candidate.id));

  await candidates.set(candidate.id, {
    ...candidate,
    adapterType: "gupy",
    careersUrl: "https://x.gupy.io/",
    status: "VALIDATED",
  });

  const promoted = await service.promote(candidate.id);
  assert.equal(promoted.status, "IMPORTED");
  assert.equal(promoted.linkedCompanyId, "company-1");
  assert.equal(importRowCalls.length, 1);
});

test("promote aceita status NO_TECH_JOBS (adapter/URL ja confirmados, so sem vaga de tech no momento)", async () => {
  const { service, candidates, importRowCalls } = createFixture();
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nUsiminas,,,https://usiminas.gupy.io,gupy",
  });
  const candidate = [...candidates.values()][0];

  await candidates.set(candidate.id, {
    ...candidate,
    adapterType: "gupy",
    careersUrl: "https://usiminas.gupy.io/",
    jobCount: 0,
    rawJobCount: 11,
    status: "NO_TECH_JOBS",
  });

  const promoted = await service.promote(candidate.id);
  assert.equal(promoted.status, "IMPORTED");
  assert.equal(importRowCalls.length, 1);
});

test("promote aceita status NO_ACTIVE_JOBS (adapter/URL confirmados, board so estava vazio no momento)", async () => {
  const { service, candidates, importRowCalls } = createFixture();
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nBanco Original,,,https://banco-original.gupy.io,gupy",
  });
  const candidate = [...candidates.values()][0];

  await candidates.set(candidate.id, {
    ...candidate,
    adapterType: "gupy",
    careersUrl: "https://banco-original.gupy.io/",
    jobCount: 0,
    rawJobCount: 0,
    status: "NO_ACTIVE_JOBS",
  });

  const promoted = await service.promote(candidate.id);
  assert.equal(promoted.status, "IMPORTED");
  assert.equal(importRowCalls.length, 1);
});

test("promote recusa candidato INVALID (URL nao resolveu ou nenhum slug bateu)", async () => {
  const { service, candidates } = createFixture();
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa Sem Match" });
  const candidate = [...candidates.values()][0];

  await candidates.set(candidate.id, {
    ...candidate,
    status: "INVALID",
  });

  await assert.rejects(() => service.promote(candidate.id));
});

test("promoteAll promove todos os promotáveis e reporta falhas isoladas sem travar o lote", async () => {
  let calls = 0;
  const { service, candidates } = createFixture({
    importRowImpl: async (row) => {
      calls += 1;
      if (row.nome === "Empresa Com Erro") {
        return {
          companyAction: "error",
          companyName: row.nome,
          message: "site fora do ar",
          sourceAction: "error",
          status: "error",
        };
      }
      return {
        companyAction: "created",
        companyId: "company-1",
        companyName: row.nome,
        sourceAction: "created",
        status: "success",
      };
    },
  });

  await service.importCandidatesCsv({
    csvText: "nome\nEmpresa Ok\nEmpresa Com Erro\nEmpresa Ainda Pendente",
  });
  const [ok, comErro, aindaPendente] = [...candidates.values()];
  await candidates.set(ok.id, {
    ...ok,
    adapterType: "gupy",
    careersUrl: "https://empresa-ok.gupy.io",
    status: "VALIDATED",
  });
  await candidates.set(comErro.id, {
    ...comErro,
    adapterType: "gupy",
    careersUrl: "https://empresa-com-erro.gupy.io",
    status: "NO_TECH_JOBS",
  });
  // aindaPendente fica PENDING — não deve nem entrar no lote de promoteAll.

  const report = await service.promoteAll();

  assert.equal(report.totalCount, 2);
  assert.equal(report.promotedCount, 1);
  assert.equal(report.failedCount, 1);
  assert.equal(report.errors[0]?.name, "Empresa Com Erro");
  assert.equal(calls, 2);
  assert.equal(candidates.get(ok.id)?.status, "IMPORTED");
  assert.equal(candidates.get(comErro.id)?.status, "NO_TECH_JOBS");
  assert.equal(candidates.get(aindaPendente.id)?.status, "PENDING");
});

test("promoteManual cria a fonte com URL/adapter informados na mão, mesmo pra candidato DISMISSED", async () => {
  const { service, candidates, importRowCalls } = createFixture();
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa Achada Na Mao" });
  const candidate = [...candidates.values()][0];
  await service.dismiss(candidate.id);
  assert.equal(candidates.get(candidate.id)?.status, "DISMISSED");

  const promoted = await service.promoteManual(candidate.id, {
    adapterType: "greenhouse",
    careersUrl: "https://boards.greenhouse.io/empresaachadanamao",
  });

  assert.equal(promoted.status, "IMPORTED");
  assert.equal(importRowCalls.length, 1);
  assert.equal(candidates.get(candidate.id)?.adapterType, "greenhouse");
});

test("promoteManual recusa adapterType inválido e candidato já IMPORTED", async () => {
  const { service, candidates } = createFixture();
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa X" });
  const candidate = [...candidates.values()][0];

  await assert.rejects(() =>
    service.promoteManual(candidate.id, {
      adapterType: "nao-existe",
      careersUrl: "https://x.gupy.io",
    }),
  );

  await candidates.set(candidate.id, { ...candidate, status: "IMPORTED" });
  await assert.rejects(() =>
    service.promoteManual(candidate.id, {
      adapterType: "gupy",
      careersUrl: "https://x.gupy.io",
    }),
  );
});

test("validateOne revalida um único candidato independente do status atual", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ inconclusive: false, jobCount: 4, ok: true }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nBanco Original,,,https://banco-original.gupy.io,gupy",
  });
  const candidate = [...candidates.values()][0];
  await candidates.set(candidate.id, {
    ...candidate,
    status: "NO_ACTIVE_JOBS",
  });

  const revalidated = await service.validateOne(candidate.id);

  assert.equal(revalidated.status, "VALIDATED");
  assert.equal(revalidated.jobCount, 4);
});

test("validateOne recusa candidato já IMPORTED e propaga inconclusivo como erro", async () => {
  const { service, candidates } = createFixture({
    probeImpl: async () => ({ error: "timeout", inconclusive: true, jobCount: 0, ok: false }),
  });
  await service.importCandidatesCsv({
    csvText:
      "nome,setor,site_url,careers_url,tipo_adapter\nBanco Original,,,https://banco-original.gupy.io,gupy",
  });
  const candidate = [...candidates.values()][0];

  await assert.rejects(() => service.validateOne(candidate.id));

  await candidates.set(candidate.id, { ...candidate, status: "IMPORTED" });
  await assert.rejects(() => service.validateOne(candidate.id));
});

test("dismiss marca DISMISSED e recusa candidato já IMPORTED", async () => {
  const { service, candidates } = createFixture();
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa X" });
  const candidate = [...candidates.values()][0];

  const dismissed = await service.dismiss(candidate.id);
  assert.equal(dismissed.status, "DISMISSED");

  await candidates.set(candidate.id, { ...candidate, status: "IMPORTED" });
  await assert.rejects(() => service.dismiss(candidate.id));
});
