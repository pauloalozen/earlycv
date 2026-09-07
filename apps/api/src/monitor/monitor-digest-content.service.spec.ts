import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_RECOMMENDATIONS_PER_DIGEST,
  MonitorDigestContentService,
} from "./monitor-digest-content.service";

type Row = {
  id: string;
  userId: string;
  dismissedAt: Date | null;
  supersededAt: Date | null;
  opportunityLevel: number;
  recommendedAt: Date;
  alreadyDigested: boolean;
};

function createFixture(rows: Row[]) {
  const database = {
    userJobRecommendation: {
      // Ordena de acordo com o orderBy pedido de verdade pelo serviço (em
      // vez de um critério fixo no mock) — senão um teste que verifica
      // ordenação não pega regressão nenhuma, já que o mock sempre
      // devolveria a mesma ordem independente do que o serviço pediu.
      findMany: async ({
        where,
        orderBy,
        take,
      }: {
        where: {
          userId: string;
          dismissedAt: null;
          supersededAt: null;
          digestInclusions: { none: object };
        };
        orderBy: Array<
          { opportunityLevel: "desc" } | { recommendedAt: "desc" }
        >;
        take: number;
      }) => {
        return rows
          .filter(
            (r) =>
              r.userId === where.userId &&
              r.dismissedAt === null &&
              r.supersededAt === null &&
              !r.alreadyDigested,
          )
          .sort((a, b) => {
            for (const clause of orderBy) {
              if ("opportunityLevel" in clause) {
                const diff = b.opportunityLevel - a.opportunityLevel;
                if (diff !== 0) return diff;
              }
              if ("recommendedAt" in clause) {
                const diff =
                  b.recommendedAt.getTime() - a.recommendedAt.getTime();
                if (diff !== 0) return diff;
              }
            }
            return 0;
          })
          .slice(0, take)
          .map((r) => ({ ...r, job: { company: { name: "Acme" } } }));
      },
    },
  };

  return new MonitorDigestContentService(database as never);
}

test("excludes dismissed recommendations", async () => {
  const service = createFixture([
    {
      id: "rec-1",
      userId: "user-1",
      dismissedAt: new Date(),
      supersededAt: null,
      opportunityLevel: 4,
      recommendedAt: new Date(),
      alreadyDigested: false,
    },
  ]);

  const result = await service.getEligibleRecommendations("user-1");
  assert.deepEqual(result, []);
});

test("excludes superseded recommendations", async () => {
  const service = createFixture([
    {
      id: "rec-1",
      userId: "user-1",
      dismissedAt: null,
      supersededAt: new Date(),
      opportunityLevel: 4,
      recommendedAt: new Date(),
      alreadyDigested: false,
    },
  ]);

  const result = await service.getEligibleRecommendations("user-1");
  assert.deepEqual(result, []);
});

test("excludes recommendations already included in any previous digest", async () => {
  const service = createFixture([
    {
      id: "rec-1",
      userId: "user-1",
      dismissedAt: null,
      supersededAt: null,
      opportunityLevel: 4,
      recommendedAt: new Date(),
      alreadyDigested: true,
    },
  ]);

  const result = await service.getEligibleRecommendations("user-1");
  assert.deepEqual(result, []);
});

test("includes active, never-digested recommendations, ordered by opportunityLevel desc then recency", async () => {
  const now = Date.now();
  const service = createFixture([
    {
      id: "rec-newer-low-level",
      userId: "user-1",
      dismissedAt: null,
      supersededAt: null,
      opportunityLevel: 3,
      recommendedAt: new Date(now),
      alreadyDigested: false,
    },
    {
      id: "rec-older-low-level",
      userId: "user-1",
      dismissedAt: null,
      supersededAt: null,
      opportunityLevel: 3,
      recommendedAt: new Date(now - 2000),
      alreadyDigested: false,
    },
    {
      id: "rec-older-high-level",
      userId: "user-1",
      dismissedAt: null,
      supersededAt: null,
      opportunityLevel: 5,
      recommendedAt: new Date(now - 2000),
      alreadyDigested: false,
    },
  ]);

  const result = await service.getEligibleRecommendations("user-1");
  // Com o teto caindo pra 5 (achado real: e-mail poluído com 30 vagas por
  // dia), a seleção precisa ser criteriosa — maior aderência primeiro,
  // mesmo que mais antiga (rec-older-high-level à frente das duas de
  // nível 3). Entre as duas de mesmo nível, a mais recente desempata.
  assert.deepEqual(
    result.map((r) => r.id),
    ["rec-older-high-level", "rec-newer-low-level", "rec-older-low-level"],
  );
});

test("caps at MAX_RECOMMENDATIONS_PER_DIGEST (5) — the rest stays eligible for the next digest, not lost", async () => {
  assert.equal(MAX_RECOMMENDATIONS_PER_DIGEST, 5);
  const now = Date.now();
  const rows: Row[] = Array.from({ length: 8 }, (_, i) => ({
    id: `rec-${i}`,
    userId: "user-1",
    dismissedAt: null,
    supersededAt: null,
    opportunityLevel: 3,
    recommendedAt: new Date(now - i * 1000),
    alreadyDigested: false,
  }));
  const service = createFixture(rows);

  const result = await service.getEligibleRecommendations("user-1");

  assert.equal(result.length, MAX_RECOMMENDATIONS_PER_DIGEST);
});

test("only returns recommendations for the requested user", async () => {
  const service = createFixture([
    {
      id: "rec-other-user",
      userId: "user-2",
      dismissedAt: null,
      supersededAt: null,
      opportunityLevel: 5,
      recommendedAt: new Date(),
      alreadyDigested: false,
    },
  ]);

  const result = await service.getEligibleRecommendations("user-1");
  assert.deepEqual(result, []);
});
