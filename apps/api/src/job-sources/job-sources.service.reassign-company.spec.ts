import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import { JobSourcesService } from "./job-sources.service";

const WRONG_SOURCE = {
  id: "js-wrong",
  companyId: "company-wrong",
  sourceUrl: "https://boards.greenhouse.io/solargrid",
  sourceType: "greenhouse",
  parserKey: "greenhouse",
  crawlStrategy: "api",
  checkIntervalMinutes: 60,
  isFallbackAdapter: false,
  company: { id: "company-wrong", name: "Itaqui Energia", normalizedName: "itaqui-energia" },
  ingestionRuns: [],
};

function makeDatabase(overrides: {
  targetCompany?: unknown;
  existingTargetSource?: unknown;
} = {}) {
  const calls: Record<string, unknown[]> = {
    companyCreate: [],
    companyFindUnique: [],
    jobUpdateMany: [],
    jobSourceUpdate: [],
    jobSourceDelete: [],
    jobSourceFindFirst: [],
  };

  const database = {
    jobSource: {
      findUnique: async () => WRONG_SOURCE,
      findFirst: async (args: unknown) => {
        calls.jobSourceFindFirst.push(args);
        return overrides.existingTargetSource ?? null;
      },
      update: async (args: { where: { id: string }; data: { companyId: string } }) => {
        calls.jobSourceUpdate.push(args);
        return {
          ...WRONG_SOURCE,
          companyId: args.data.companyId,
          company: { id: args.data.companyId, name: "Solar Grid", normalizedName: "solar-grid" },
        };
      },
      delete: async (args: unknown) => {
        calls.jobSourceDelete.push(args);
        return {};
      },
      findUniqueOrThrow: async (args: { where: { id: string } }) => ({
        ...WRONG_SOURCE,
        id: args.where.id,
        companyId: "company-target",
        company: { id: "company-target", name: "Solar Grid", normalizedName: "solar-grid" },
      }),
    },
    company: {
      findUnique: async (args: unknown) => {
        calls.companyFindUnique.push(args);
        return overrides.targetCompany ?? null;
      },
      create: async (args: { data: unknown }) => {
        calls.companyCreate.push(args);
        return { id: "company-new", isActive: true, ...(args.data as object) };
      },
    },
    job: {
      updateMany: async (args: unknown) => {
        calls.jobUpdateMany.push(args);
        return { count: 5 };
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(database),
  };

  return { database, calls };
}

test("reassignCompany() cria empresa nova e move a fonte + vagas quando ninguem tem essa URL ainda", async () => {
  const { database, calls } = makeDatabase();
  const service = new JobSourcesService(database as never, {} as never);

  const result = await service.reassignCompany("js-wrong", {
    companyName: "Solar Grid",
  } as never);

  assert.equal(calls.companyCreate.length, 1);
  assert.deepEqual((calls.companyCreate[0] as { data: unknown }).data, {
    name: "Solar Grid",
    normalizedName: "solar-grid",
    isActive: true,
  });

  assert.equal(calls.jobUpdateMany.length, 1);
  assert.deepEqual(calls.jobUpdateMany[0], {
    where: { jobSourceId: "js-wrong" },
    data: { companyId: "company-new" },
  });

  assert.equal(calls.jobSourceUpdate.length, 1);
  assert.deepEqual(calls.jobSourceUpdate[0], {
    where: { id: "js-wrong" },
    data: { companyId: "company-new" },
    include: {
      company: true,
      ingestionRuns: {
        orderBy: [{ startedAt: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });

  assert.equal(calls.jobSourceDelete.length, 0);
  assert.equal(result.merged, false);
  assert.equal(result.jobsMoved, 5);
});

test("reassignCompany() funde na fonte existente quando a empresa certa ja tem essa mesma URL", async () => {
  const existingTargetSource = {
    id: "js-correct",
    companyId: "company-target",
    sourceUrl: WRONG_SOURCE.sourceUrl,
  };
  const targetCompany = {
    id: "company-target",
    name: "Solar Grid",
    normalizedName: "solar-grid",
    isActive: true,
  };
  const { database, calls } = makeDatabase({ targetCompany, existingTargetSource });
  const service = new JobSourcesService(database as never, {} as never);

  const result = await service.reassignCompany("js-wrong", {
    companyName: "Solar Grid",
  } as never);

  assert.equal(calls.jobUpdateMany.length, 1);
  assert.deepEqual(calls.jobUpdateMany[0], {
    where: { jobSourceId: "js-wrong" },
    data: { companyId: "company-target", jobSourceId: "js-correct" },
  });

  assert.equal(calls.jobSourceDelete.length, 1);
  assert.deepEqual(calls.jobSourceDelete[0], { where: { id: "js-wrong" } });
  assert.equal(calls.jobSourceUpdate.length, 0);
  assert.equal(result.merged, true);
  assert.equal(result.jobsMoved, 5);
});

test("reassignCompany() rejeita mover pra mesma empresa que ja e a dona", async () => {
  const { database } = makeDatabase();
  const service = new JobSourcesService(database as never, {} as never);

  await assert.rejects(
    () =>
      service.reassignCompany("js-wrong", {
        companyName: "Itaqui Energia",
      } as never),
    /já pertence/,
  );
});

test("reassignCompany() rejeita nome que normaliza pra vazio", async () => {
  const { database } = makeDatabase();
  const service = new JobSourcesService(database as never, {} as never);

  await assert.rejects(
    () => service.reassignCompany("js-wrong", { companyName: "***" } as never),
    /inválido/,
  );
});
