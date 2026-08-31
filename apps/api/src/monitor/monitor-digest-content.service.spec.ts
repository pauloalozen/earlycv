import assert from "node:assert/strict";
import { test } from "node:test";

import { MonitorDigestContentService } from "./monitor-digest-content.service";

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
      findMany: async ({
        where,
        take,
      }: {
        where: {
          userId: string;
          dismissedAt: null;
          supersededAt: null;
          digestInclusions: { none: object };
        };
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
            if (b.recommendedAt.getTime() !== a.recommendedAt.getTime()) {
              return b.recommendedAt.getTime() - a.recommendedAt.getTime();
            }
            return b.opportunityLevel - a.opportunityLevel;
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

test("includes active, never-digested recommendations, ordered by recency desc then opportunityLevel", async () => {
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
  // A vaga mais recente vem primeiro mesmo com nível menor
  // (rec-newer-low-level à frente das duas mais antigas). Entre as duas
  // com o mesmo recommendedAt, o nível desempata.
  assert.deepEqual(
    result.map((r) => r.id),
    ["rec-newer-low-level", "rec-older-high-level", "rec-older-low-level"],
  );
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
