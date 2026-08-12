import assert from "node:assert/strict";
import { test } from "node:test";

import type { DatabaseService } from "../database/database.service";
import { AdminIngestionImportService } from "./admin-ingestion-import.service";

function createDatabaseMock() {
  const companies = new Map<string, { id: string; normalizedName: string }>();
  const sources = new Map<
    string,
    { id: string; companyId: string; sourceUrl: string; sourceType: string }
  >();
  let nextId = 1;

  const database = {
    company: {
      findUnique: async ({ where }: { where: { normalizedName: string } }) =>
        companies.get(where.normalizedName) ?? null,
      create: async ({
        data,
      }: {
        data: { normalizedName: string; name: string };
      }) => {
        const company = { id: `company-${nextId++}`, ...data };
        companies.set(data.normalizedName, company);
        return company;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = [...companies.values()].find((c) => c.id === where.id);
        Object.assign(existing as object, data);
        return existing;
      },
    },
    jobSource: {
      findUnique: async ({
        where,
      }: {
        where: {
          companyId_sourceUrl: { companyId: string; sourceUrl: string };
        };
      }) => {
        const key = `${where.companyId_sourceUrl.companyId}:${where.companyId_sourceUrl.sourceUrl}`;
        return sources.get(key) ?? null;
      },
      create: async ({
        data,
      }: {
        data: { companyId: string; sourceUrl: string; sourceType: string };
      }) => {
        const source = { id: `source-${nextId++}`, ...data };
        sources.set(`${data.companyId}:${data.sourceUrl}`, source);
        return source;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) => {
        const existing = [...sources.values()].find((s) => s.id === where.id);
        Object.assign(existing as object, data);
        return existing;
      },
      findMany: async () => [...sources.values()],
    },
  } as unknown as DatabaseService;

  return { database, sources };
}

test("importCompanySourcesCsv accepts the legacy 5-column header and infers gupy/custom_html from the URL", async () => {
  const { database, sources } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url",
    "ACME,Tech,https://acme.dev,https://acme.gupy.io,",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 0);
  assert.equal(report.lines[0]?.status, "success");
  assert.equal(
    (report.lines[0] as { inferredAdapter: string }).inferredAdapter,
    "gupy",
  );
  const source = [...sources.values()][0];
  assert.equal(source?.sourceType, "gupy");
});

test("importCompanySourcesCsv honors an explicit tipo_adapter column over URL inference", async () => {
  const { database, sources } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter",
    "VTEX,Tech,https://vtex.com,https://boards-api.greenhouse.io/v1/boards/vtex/jobs,,greenhouse",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 0);
  assert.equal(
    (report.lines[0] as { inferredAdapter: string }).inferredAdapter,
    "greenhouse",
  );
  const source = [...sources.values()][0];
  assert.equal(source?.sourceType, "greenhouse");
});

test("importCompanySourcesCsv accepts ashby, inhire, teamtailor, talentbrew and workday as explicit adapter types", async () => {
  const { database, sources } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter",
    "Nubank,Fintech,https://nubank.com.br,https://api.ashbyhq.com/posting-api/job-board/nubank,,ashby",
    "Cielo,Fintech,https://cielo.com.br,https://cielo.inhire.app,,inhire",
    "Loft,Proptech,https://loft.com.br,https://loft.teamtailor.com,,teamtailor",
    "Itau,Bancos,https://itau.com.br,https://carreiras.itau.com.br,,talentbrew",
    "Santander,Bancos,https://santander.com.br,https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers,,workday",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 0);
  assert.deepEqual(
    report.lines.map(
      (line) => (line as { inferredAdapter: string }).inferredAdapter,
    ),
    ["ashby", "inhire", "teamtailor", "talentbrew", "workday"],
  );
  assert.deepEqual(
    [...sources.values()].map((source) => source.sourceType),
    ["ashby", "inhire", "teamtailor", "talentbrew", "workday"],
  );
});

test("importCompanySourcesCsv rejects an unknown tipo_adapter value", async () => {
  const { database } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter",
    "ACME,Tech,https://acme.dev,https://acme.gupy.io,,solides",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 1);
  assert.equal(report.lines[0]?.status, "error");
  assert.match(
    (report.lines[0] as { message: string }).message,
    /invalid tipo_adapter/,
  );
});

test("importCompanySourcesCsv rejects a header that doesn't match either the legacy or current shape", async () => {
  const { database } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = ["nome,setor", "ACME,Tech"].join("\n");

  await assert.rejects(
    () => service.importCompanySourcesCsv({ csvText: csv, dryRun: false }),
    /invalid csv header/,
  );
});

test("exportCompanySourcesCsv includes tipo_adapter and the operational config columns (ativa/escalonamento/agendamento)", async () => {
  const { database, sources } = createDatabaseMock();
  sources.set(
    "company-1:https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
    {
      id: "source-1",
      companyId: "company-1",
      sourceUrl: "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
      sourceType: "greenhouse",
    },
  );

  (database.jobSource.findMany as unknown as () => Promise<unknown[]>) =
    async () => [
      {
        sourceUrl: "https://boards-api.greenhouse.io/v1/boards/vtex/jobs",
        sourceType: "greenhouse",
        isActive: true,
        checkIntervalMinutes: 45,
        scheduleEnabled: true,
        scheduleCron: "0 7 * * *",
        company: {
          name: "VTEX",
          industry: "Tech",
          websiteUrl: "https://vtex.com",
          linkedinUrl: null,
        },
      },
    ];

  const service = new AdminIngestionImportService(database);
  const csv = await service.exportCompanySourcesCsv();
  const [header, row] = csv.split("\n");

  assert.equal(
    header,
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter,ativa,escalonamento_minutos,agendamento_ativo,agendamento_cron",
  );
  assert.equal(
    row,
    "VTEX,Tech,https://vtex.com,https://boards-api.greenhouse.io/v1/boards/vtex/jobs,,greenhouse,true,45,true,0 7 * * *",
  );
});

test("importCompanySourcesCsv reads ativa/escalonamento/agendamento from the full header and applies them to a new source", async () => {
  const { database, sources } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter,ativa,escalonamento_minutos,agendamento_ativo,agendamento_cron",
    "VTEX,Tech,https://vtex.com,https://boards-api.greenhouse.io/v1/boards/vtex/jobs,,greenhouse,false,45,true,0 7 * * *",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 0);
  const source = [...sources.values()][0] as unknown as {
    isActive: boolean;
    checkIntervalMinutes: number;
    scheduleEnabled: boolean;
    scheduleCron: string | null;
  };
  assert.equal(source.isActive, false);
  assert.equal(source.checkIntervalMinutes, 45);
  assert.equal(source.scheduleEnabled, true);
  assert.equal(source.scheduleCron, "0 7 * * *");
});

test("importCompanySourcesCsv falls back to isActive=true/scheduleEnabled=false/checkIntervalMinutes=30 when the config columns are absent", async () => {
  const { database, sources } = createDatabaseMock();
  const service = new AdminIngestionImportService(database);

  const csv = [
    "nome,setor,site_url,careers_url,linkedin_url,tipo_adapter",
    "VTEX,Tech,https://vtex.com,https://boards-api.greenhouse.io/v1/boards/vtex/jobs,,greenhouse",
  ].join("\n");

  const report = await service.importCompanySourcesCsv({
    csvText: csv,
    dryRun: false,
  });

  assert.equal(report.summary.errorCount, 0);
  const source = [...sources.values()][0] as unknown as {
    isActive: boolean;
    checkIntervalMinutes: number;
    scheduleEnabled: boolean;
    scheduleCron: string | null;
  };
  assert.equal(source.isActive, true);
  assert.equal(source.checkIntervalMinutes, 30);
  assert.equal(source.scheduleEnabled, false);
  assert.equal(source.scheduleCron, null);
});
