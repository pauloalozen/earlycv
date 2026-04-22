import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";
import type { InternalRole } from "@prisma/client";
import { DatabaseModule } from "../database/database.module";
import { EARLYCV_DATABASE_CLIENT } from "../database/database.service";
import { AnalysisConfigService } from "./analysis-config.service";
import {
  ANALYSIS_CONFIG_ENV_PREFIX,
  ANALYSIS_CONFIG_SCHEMA,
} from "./config/analysis-config.schema";

test("analysis config schema includes required protection flags", () => {
  assert.equal(ANALYSIS_CONFIG_SCHEMA.kill_switch_enabled.type, "boolean");
  assert.equal(ANALYSIS_CONFIG_SCHEMA.kill_switch_enabled.default, false);
  assert.equal(ANALYSIS_CONFIG_SCHEMA.dedupe_enforced.type, "boolean");
  assert.equal(ANALYSIS_CONFIG_SCHEMA.dedupe_enforced.default, true);
  assert.equal(ANALYSIS_CONFIG_SCHEMA.daily_limit_enforced.type, "boolean");
  assert.equal(ANALYSIS_CONFIG_SCHEMA.daily_limit_enforced.default, true);
});

const withEnv = async (
  entries: Record<string, string | undefined>,
  execute: () => Promise<void>,
) => {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(entries)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    await execute();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
};

const toEnvKey = (key: string) =>
  `${ANALYSIS_CONFIG_ENV_PREFIX}${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

const createConfigServiceWithFindManyStub = (
  findMany: () => Promise<unknown[]>,
  now: () => number,
) => {
  return new AnalysisConfigService(
    {
      analysisProtectionConfig: {
        findMany,
      },
      $transaction: async () => {
        throw new Error("$transaction should not be called in cache tests");
      },
    } as any,
    {
      cacheTtlMs: 100,
      now,
    },
  );
};

test("analysis config records can be created and read from database", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const key = `turnstile_enforced_${randomUUID()}`;
  let rowId: string | null = null;

  try {
    const row = await prisma.analysisProtectionConfig.create({
      data: {
        isActive: true,
        key,
        riskLevel: "high",
        valueJson: true,
        valueType: "boolean",
      },
    });

    rowId = row.id;
    assert.equal(row.key, key);

    const persisted = await prisma.analysisProtectionConfig.findUnique({
      where: { id: row.id },
    });

    assert.ok(persisted);
    assert.equal(persisted.key, key);
  } finally {
    if (rowId) {
      await prisma.analysisProtectionConfig.delete({ where: { id: rowId } });
    }

    await moduleRef.close();
  }
});

test("analysis usage counter buckets reject duplicate records", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const counterKey = `daily_limit_${randomUUID()}`;
  const periodKey = "2026-04-21";
  const windowStartedAt = new Date("2026-04-21T00:00:00.000Z");
  const windowEndsAt = new Date("2026-04-22T00:00:00.000Z");

  try {
    await prisma.analysisUsageCounter.create({
      data: {
        counterKey,
        periodKey,
        sessionInternalId: null,
        userId: null,
        windowStartedAt,
        windowEndsAt,
      },
    });

    await assert.rejects(
      prisma.analysisUsageCounter.create({
        data: {
          counterKey,
          periodKey,
          sessionInternalId: null,
          userId: null,
          windowStartedAt,
          windowEndsAt,
        },
      }),
      /Unique constraint failed/i,
    );
  } finally {
    await prisma.analysisUsageCounter.deleteMany({
      where: { counterKey, periodKey },
    });

    await moduleRef.close();
  }
});

test("analysis request fingerprint aggregation key rejects duplicates", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const canonicalHash = `canon_${randomUUID()}`;
  const ipHash = `ip_${randomUUID()}`;

  try {
    await prisma.analysisRequestFingerprint.create({
      data: {
        canonicalHash,
        sessionInternalId: null,
        userId: null,
        ipHash,
      },
    });

    await assert.rejects(
      prisma.analysisRequestFingerprint.create({
        data: {
          canonicalHash,
          sessionInternalId: null,
          userId: null,
          ipHash,
        },
      }),
      /Unique constraint failed/i,
    );
  } finally {
    await prisma.analysisRequestFingerprint.deleteMany({
      where: { canonicalHash, sessionInternalId: null, userId: null, ipHash },
    });

    await moduleRef.close();
  }
});

test("resolves config by precedence database > env > default", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "turnstile_enforced";
  const envKey = toEnvKey(key);

  try {
    await prisma.analysisProtectionConfig.upsert({
      where: { key },
      update: { isActive: true, valueJson: true, valueType: "boolean" },
      create: {
        key,
        isActive: true,
        riskLevel: "high",
        valueJson: true,
        valueType: "boolean",
      },
    });

    await withEnv({ [envKey]: "false" }, async () => {
      const resolved = await service.getBoolean(key);

      assert.equal(resolved.value, true);
      assert.equal(resolved.origin, "database");
    });
  } finally {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await moduleRef.close();
  }
});

test("falls back to env and then default when database config is missing", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "rollout_mode";
  const envKey = toEnvKey(key);

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });

    await withEnv({ [envKey]: "hard-block" }, async () => {
      const fromEnv = await service.getEnum(key);

      assert.equal(fromEnv.value, "hard-block");
      assert.equal(fromEnv.origin, "env");
    });

    await withEnv({ [envKey]: undefined }, async () => {
      const fallback = await service.getEnum(key);

      assert.equal(fallback.value, ANALYSIS_CONFIG_SCHEMA[key].default);
      assert.equal(fallback.origin, "default");
    });
  } finally {
    await moduleRef.close();
  }
});

test("rejects invalid env values and invalid ranged values from database", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const boolKey = "auth_emergency_enabled";
  const boolEnvKey = toEnvKey(boolKey);
  const intKey = "rate_limit_raw_per_minute";

  try {
    await prisma.analysisProtectionConfig.deleteMany({
      where: { key: boolKey },
    });

    await withEnv({ [boolEnvKey]: "not-a-boolean" }, async () => {
      await assert.rejects(service.getBoolean(boolKey), /invalid boolean/i);
    });

    await prisma.analysisProtectionConfig.upsert({
      where: { key: intKey },
      update: { isActive: true, valueJson: 0, valueType: "int" },
      create: {
        key: intKey,
        isActive: true,
        riskLevel: "medium",
        valueJson: 0,
        valueType: "int",
      },
    });

    await assert.rejects(service.getInt(intKey), /out of range/i);
  } finally {
    await prisma.analysisProtectionConfig.deleteMany({
      where: { key: intKey },
    });
    await moduleRef.close();
  }
});

test("rejects malformed percent values from env", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "abuse_signal_threshold_percent";
  const envKey = toEnvKey(key);

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });

    await withEnv({ [envKey]: "85abc" }, async () => {
      await assert.rejects(service.getAll(), /invalid percent/i);
    });
  } finally {
    await moduleRef.close();
  }
});

test("parses unit config values from env and database", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "dedupe_lock_ttl";
  const envKey = toEnvKey(key);

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });

    await withEnv({ [envKey]: "12s" }, async () => {
      const resolved = await service.getAll();

      assert.equal(resolved[key], 12_000);
    });

    await prisma.analysisProtectionConfig.upsert({
      where: { key },
      update: { isActive: true, valueJson: "9s", valueType: "string" },
      create: {
        key,
        isActive: true,
        riskLevel: "medium",
        valueJson: "9s",
        valueType: "string",
      },
    });

    const resolved = await service.getAll();

    assert.equal(resolved[key], 9_000);
  } finally {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await moduleRef.close();
  }
});

test("normalizes list values consistently for env strings and database arrays", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "protected_routes_allowlist";
  const envKey = toEnvKey(key);

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });

    await withEnv({ [envKey]: " /a, , /b ,, " }, async () => {
      const resolved = await service.getAll();

      assert.deepEqual(resolved[key], ["/a", "/b"]);
    });

    await prisma.analysisProtectionConfig.upsert({
      where: { key },
      update: {
        isActive: true,
        valueJson: [" /x ", "", "   ", "/y"],
        valueType: "json",
      },
      create: {
        key,
        isActive: true,
        riskLevel: "medium",
        valueJson: [" /x ", "", "   ", "/y"],
        valueType: "json",
      },
    });

    const resolved = await service.getAll();

    assert.deepEqual(resolved[key], ["/x", "/y"]);
  } finally {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await moduleRef.close();
  }
});

test("rejects cross-config invalid combinations", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });

  try {
    await prisma.analysisProtectionConfig.upsert({
      where: { key: "rate_limit_raw_per_minute" },
      update: { isActive: true, valueJson: 10, valueType: "int" },
      create: {
        key: "rate_limit_raw_per_minute",
        isActive: true,
        riskLevel: "medium",
        valueJson: 10,
        valueType: "int",
      },
    });

    await prisma.analysisProtectionConfig.upsert({
      where: { key: "rate_limit_contextual_per_minute" },
      update: { isActive: true, valueJson: 11, valueType: "int" },
      create: {
        key: "rate_limit_contextual_per_minute",
        isActive: true,
        riskLevel: "medium",
        valueJson: 11,
        valueType: "int",
      },
    });

    await assert.rejects(service.getAll(), /contextual.*cannot exceed.*raw/i);
  } finally {
    await prisma.analysisProtectionConfig.deleteMany({
      where: {
        key: {
          in: ["rate_limit_raw_per_minute", "rate_limit_contextual_per_minute"],
        },
      },
    });
    await moduleRef.close();
  }
});

test("uses in-memory cache for hot reads until TTL expires", async () => {
  let findManyCalls = 0;
  let now = 10_000;
  const service = createConfigServiceWithFindManyStub(
    async () => {
      findManyCalls += 1;

      return [];
    },
    () => now,
  );

  const first = await service.getAll();
  const second = await service.getAll();

  assert.deepEqual(first, second);
  assert.equal(findManyCalls, 1);

  now += 101;
  const third = await service.getAll();

  assert.equal(third.turnstile_enforced, true);
  assert.equal(findManyCalls, 2);
});

test("writes config changes with audit record payload", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "rollout_mode";

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await prisma.analysisProtectionConfigAudit.deleteMany({ where: { key } });

    await service.setConfig({
      actor: {
        id: "actor_admin_1",
        role: "admin",
      },
      context: {
        reason: "compliance-review",
        ticket: "TASK-3",
      },
      key,
      source: "analysis-config.service.spec.ts",
      value: "soft-block",
    });

    const auditEntry = await prisma.analysisProtectionConfigAudit.findFirst({
      orderBy: { changedAt: "desc" },
      where: { key },
    });

    assert.ok(auditEntry);
    assert.equal(auditEntry.actorId, "actor_admin_1");
    assert.equal(auditEntry.actorRole, "admin");
    assert.equal(auditEntry.source, "analysis-config.service.spec.ts");
    assert.equal(auditEntry.valueType, "enum");
    assert.equal(auditEntry.riskLevel, "high");
    assert.equal(auditEntry.oldValueJson, null);
    assert.equal(auditEntry.newValueJson, "soft-block");
    assert.deepEqual(auditEntry.technicalContextJson, {
      reason: "compliance-review",
      ticket: "TASK-3",
    });
  } finally {
    await prisma.analysisProtectionConfigAudit.deleteMany({ where: { key } });
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await moduleRef.close();
  }
});

test("blocks high-risk config writes from non-admin roles", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
    providers: [AnalysisConfigService],
  }).compile();

  const prisma = moduleRef.get(EARLYCV_DATABASE_CLIENT, {
    strict: false,
  }) as any;
  const service = moduleRef.get(AnalysisConfigService, {
    strict: false,
  });
  const key = "kill_switch_enabled";
  const disallowedRoles: InternalRole[] = ["none"];

  try {
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await prisma.analysisProtectionConfigAudit.deleteMany({ where: { key } });

    for (const role of disallowedRoles) {
      await assert.rejects(
        service.setConfig({
          actor: {
            id: "actor_no_priv",
            role,
          },
          context: {
            reason: "unauthorized-change",
          },
          key,
          source: "analysis-config.service.spec.ts",
          value: true,
        }),
        /not allowed to change high-risk config/i,
      );
    }

    const configRow = await prisma.analysisProtectionConfig.findUnique({
      where: { key },
    });
    const auditRows = await prisma.analysisProtectionConfigAudit.findMany({
      where: { key },
    });

    assert.equal(configRow, null);
    assert.equal(auditRows.length, 0);
  } finally {
    await prisma.analysisProtectionConfigAudit.deleteMany({ where: { key } });
    await prisma.analysisProtectionConfig.deleteMany({ where: { key } });
    await moduleRef.close();
  }
});
