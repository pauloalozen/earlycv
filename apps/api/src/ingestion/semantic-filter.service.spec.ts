import assert from "node:assert/strict";
import { test } from "node:test";

import type { SemanticFilterConfig } from "@prisma/client";
import type { DatabaseService } from "../database/database.service";
import { SemanticFilterService } from "./semantic-filter.service";

function createConfig(
  overrides: Partial<SemanticFilterConfig> = {},
): SemanticFilterConfig {
  return {
    id: "config-id",
    version: "v1",
    isActive: true,
    techSignals: ["desenvolvedor", "engenheiro", "product manager"],
    noiseSignals: ["enfermeiro", "vendedor"],
    description: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function createDatabaseMock(config: SemanticFilterConfig | null) {
  let findFirstCalls = 0;
  const database = {
    semanticFilterConfig: {
      findFirst: async () => {
        findFirstCalls += 1;
        return config;
      },
    },
  } as unknown as DatabaseService;

  return {
    database,
    getFindFirstCalls: () => findFirstCalls,
  };
}

test("SemanticFilterService.evaluate returns ENRICH with tech_signal reason", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new SemanticFilterService(database);

  const decision = await service.evaluate("Desenvolvedor Backend Sênior");

  assert.deepEqual(decision, {
    configVersion: "v1",
    reason: "tech_signal:desenvolvedor",
    result: "ENRICH",
  });
});

test("SemanticFilterService.evaluate returns SKIP with noise_signal reason", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new SemanticFilterService(database);

  const decision = await service.evaluate("Enfermeiro Plantonista");

  assert.deepEqual(decision, {
    configVersion: "v1",
    reason: "noise_signal:enfermeiro",
    result: "SKIP",
  });
});

test("SemanticFilterService.evaluate returns SKIP with zona_cinza reason when no signal matches", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new SemanticFilterService(database);

  const decision = await service.evaluate("Coordenador de Operações");

  assert.deepEqual(decision, {
    configVersion: "v1",
    reason: "zona_cinza",
    result: "SKIP",
  });
});

test("SemanticFilterService.evaluate removes geographic suffix before evaluating", async () => {
  const { database } = createDatabaseMock(createConfig());
  const service = new SemanticFilterService(database);

  const decision = await service.evaluate("Analista de TI Sênior - São Paulo");

  assert.equal(decision.result, "SKIP");
  assert.equal(decision.reason, "zona_cinza");

  const decisionWithSignal = await service.evaluate(
    "Engenheiro de Dados - Belo Horizonte",
  );

  assert.deepEqual(decisionWithSignal, {
    configVersion: "v1",
    reason: "tech_signal:engenheiro",
    result: "ENRICH",
  });
});

test("SemanticFilterService.evaluate applies word boundary for short (<=3 char) signals", async () => {
  const { database } = createDatabaseMock(
    createConfig({ techSignals: ["ux", "cio", "dados"] }),
  );
  const service = new SemanticFilterService(database);

  const auxiliar = await service.evaluate("Auxiliar de Servicos Gerais");
  assert.equal(auxiliar.result, "SKIP");
  assert.equal(auxiliar.reason, "zona_cinza");

  const comercial = await service.evaluate("Analista Comercial Internacional");
  assert.equal(comercial.result, "SKIP");
  assert.equal(comercial.reason, "zona_cinza");

  const uxDesigner = await service.evaluate("UX Designer");
  assert.deepEqual(uxDesigner, {
    configVersion: "v1",
    reason: "tech_signal:ux",
    result: "ENRICH",
  });

  const diretorCio = await service.evaluate("Diretor CIO");
  assert.deepEqual(diretorCio, {
    configVersion: "v1",
    reason: "tech_signal:cio",
    result: "ENRICH",
  });

  const analistaDados = await service.evaluate("Analista de Dados");
  assert.deepEqual(analistaDados, {
    configVersion: "v1",
    reason: "tech_signal:dados",
    result: "ENRICH",
  });
});

test("SemanticFilterService.evaluate matches multi-word signals regardless of word order and abbreviation", async () => {
  const { database } = createDatabaseMock(
    createConfig({ techSignals: ["suporte tecnico"] }),
  );
  const service = new SemanticFilterService(database);

  const fullOrder = await service.evaluate("Tecnico de Suporte I");
  assert.deepEqual(fullOrder, {
    configVersion: "v1",
    reason: "tech_signal:suporte tecnico",
    result: "ENRICH",
  });

  const abbreviated = await service.evaluate("Tec de Suporte");
  assert.deepEqual(abbreviated, {
    configVersion: "v1",
    reason: "tech_signal:suporte tecnico",
    result: "ENRICH",
  });

  const reversed = await service.evaluate("Suporte Tecnico Senior");
  assert.deepEqual(reversed, {
    configVersion: "v1",
    reason: "tech_signal:suporte tecnico",
    result: "ENRICH",
  });

  const missingToken = await service.evaluate("Tecnico em Refrigeracao");
  assert.equal(missingToken.result, "SKIP");
  assert.equal(missingToken.reason, "zona_cinza");
});

test("SemanticFilterService.evaluate does not let a short token in a multi-word signal match unrelated words", async () => {
  const { database } = createDatabaseMock(
    createConfig({ techSignals: ["suporte de ti"] }),
  );
  const service = new SemanticFilterService(database);

  // "ti" tem so 2 chars, entao nao pode casar por prefixo com "i" (nivel
  // da vaga) nem com qualquer outra palavra curta do titulo.
  const decision = await service.evaluate("Tecnico de Suporte I");
  assert.equal(decision.result, "SKIP");
  assert.equal(decision.reason, "zona_cinza");
});

test("SemanticFilterService respects cache TTL and does not hit the database on consecutive calls", async () => {
  let now = 0;
  const { database, getFindFirstCalls } = createDatabaseMock(createConfig());
  const service = new SemanticFilterService(database, {
    cacheTtlMs: 5 * 60 * 1000,
    now: () => now,
  });

  await service.evaluate("Desenvolvedor Backend");
  await service.evaluate("Desenvolvedor Frontend");
  assert.equal(getFindFirstCalls(), 1);

  now += 4 * 60 * 1000;
  await service.evaluate("Desenvolvedor Mobile");
  assert.equal(getFindFirstCalls(), 1);

  now += 2 * 60 * 1000;
  await service.evaluate("Desenvolvedor Cloud");
  assert.equal(getFindFirstCalls(), 2);
});

test("SemanticFilterService.getActiveConfig throws when no active config exists", async () => {
  const { database } = createDatabaseMock(null);
  const service = new SemanticFilterService(database);

  await assert.rejects(
    () => service.getActiveConfig(),
    /No active SemanticFilterConfig found/,
  );
});
