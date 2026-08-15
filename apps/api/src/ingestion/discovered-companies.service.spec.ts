import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../database/database.service";
import type { AdminIngestionImportService } from "./admin-ingestion-import.service";
import { DiscoveredCompaniesService } from "./discovered-companies.service";
import type { IngestionService } from "./ingestion.service";

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
    inconclusive: boolean;
    error?: string;
  }>;
}) {
  const candidates = new Map<string, Candidate>();
  const companies = new Map<string, { id: string; normalizedName: string }>();
  const sources = new Map<string, { sourceUrl: string }>();
  let nextId = 1;

  const database = {
    discoveredCompany: {
      findMany: async ({
        where,
        orderBy: _orderBy,
      }: {
        where?: { status?: { in?: string[] } | string };
        orderBy?: unknown;
      } = {}) => {
        let items = [...candidates.values()];
        if (where?.status) {
          if (typeof where.status === "string") {
            items = items.filter((c) => c.status === where.status);
          } else if (where.status.in) {
            items = items.filter((c) => where.status.in?.includes(c.status));
          }
        }
        return items.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
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
      findFirst: async ({ where }: { where: { sourceUrl: string } }) =>
        sources.get(where.sourceUrl) ?? null,
    },
  } as unknown as DatabaseService;

  const ingestionService = {
    probeSource: async (sourceType: string, sourceUrl: string) => {
      if (options?.probeImpl) return options.probeImpl(sourceType, sourceUrl);
      return { inconclusive: false, jobCount: 0, ok: true };
    },
  } as unknown as IngestionService;

  const importRowCalls: unknown[] = [];
  const importService = {
    importRow: async (row: { nome: string }) => {
      importRowCalls.push(row);
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

  const service = new DiscoveredCompaniesService(
    database,
    ingestionService,
    importService,
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

test("dismiss marca DISMISSED e recusa candidato já IMPORTED", async () => {
  const { service, candidates } = createFixture();
  await service.importCandidatesCsv({ csvText: "nome\nEmpresa X" });
  const candidate = [...candidates.values()][0];

  const dismissed = await service.dismiss(candidate.id);
  assert.equal(dismissed.status, "DISMISSED");

  await candidates.set(candidate.id, { ...candidate, status: "IMPORTED" });
  await assert.rejects(() => service.dismiss(candidate.id));
});
