// Testes reais de banco (Postgres local) da resolução centralizada de
// ativação granular do pipeline canônico de CV — Fase 3 (pré-rollout),
// docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, "Tarefa 2".
//
// Cobre exatamente os cenários obrigatórios do plano:
//  - usuário fora da allowlist, flag global desligada -> sempre legado;
//  - usuário admin, flag global desligada -> pipeline novo;
//  - usuário comum na allowlist, flag global desligada -> pipeline novo;
//  - usuário comum fora da allowlist -> legado, mesmo se outro usuário
//    estiver na allowlist;
//  - guest (sem userId), flag global desligada -> sempre legado;
//  - guest (sem userId), flag global ligada -> pipeline novo (mesmo master
//    switch do usuário autenticado, sem allowlist dedicada de guest).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  CvProcessingFlagResolverService,
  parsePipelineAllowlistUserIds,
} from "./cv-processing-flag-resolver.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const resolver = new CvProcessingFlagResolverService(database);

async function createUser(
  internalRole: "none" | "admin" | "superadmin" = "none",
) {
  return prisma.user.create({
    data: {
      email: `flag-resolver+${randomUUID()}@example.com`,
      name: "Flag Resolver Test",
      internalRole,
    },
  });
}

async function withEnv<T>(
  vars: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    previous[key] = process.env[key];
    const value = vars[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(previous)) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("parsePipelineAllowlistUserIds: parsing puro — separa por vírgula, ignora vazios/espaços", () => {
  assert.deepEqual([...parsePipelineAllowlistUserIds(undefined)], []);
  assert.deepEqual([...parsePipelineAllowlistUserIds("")], []);
  assert.deepEqual([...parsePipelineAllowlistUserIds("  ,  ,")], []);
  assert.deepEqual(
    [...parsePipelineAllowlistUserIds("user-1, user-2 ,,user-3")].sort(),
    ["user-1", "user-2", "user-3"],
  );
});

test("resolver: flag global desligada + usuário fora da allowlist + não-admin -> sempre legado", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: undefined,
    },
    async () => {
      const user = await createUser("none");
      const enabled = await resolver.isEnabledFor({ userId: user.id });
      assert.equal(enabled, false);
    },
  );
});

test("resolver: usuário admin -> pipeline novo, mesmo com flag global desligada e fora da allowlist", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: undefined,
    },
    async () => {
      const admin = await createUser("admin");
      assert.equal(await resolver.isEnabledFor({ userId: admin.id }), true);

      const superadmin = await createUser("superadmin");
      assert.equal(
        await resolver.isEnabledFor({ userId: superadmin.id }),
        true,
      );
    },
  );
});

test("resolver: usuário comum NA allowlist -> pipeline novo, mesmo com flag global desligada", async () => {
  const user = await createUser("none");
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: `outro-id,${user.id},mais-outro`,
    },
    async () => {
      assert.equal(await resolver.isEnabledFor({ userId: user.id }), true);
    },
  );
});

test("resolver: usuário comum FORA da allowlist -> legado, mesmo com outro usuário na allowlist", async () => {
  const inAllowlist = await createUser("none");
  const outsideAllowlist = await createUser("none");
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: inAllowlist.id,
    },
    async () => {
      assert.equal(
        await resolver.isEnabledFor({ userId: outsideAllowlist.id }),
        false,
      );
      assert.equal(
        await resolver.isEnabledFor({ userId: inAllowlist.id }),
        true,
      );
    },
  );
});

test("resolver: guest (sem userId), flag global desligada -> legado, mesmo com um usuário-alvo qualquer na allowlist de userId", async () => {
  const user = await createUser("none");
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: user.id,
    },
    async () => {
      assert.equal(await resolver.isEnabledFor({}), false);
    },
  );
});

test("resolver: flag global ligada -> liga para usuário autenticado E para guest, mesmo master switch", async () => {
  await withEnv(
    { CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: "true" },
    async () => {
      assert.equal(await resolver.isEnabledFor({}), true);
      const user = await createUser("none");
      assert.equal(await resolver.isEnabledFor({ userId: user.id }), true);
    },
  );
});

test("resolver: userId de usuário inexistente (nunca deveria acontecer em produção, mas não pode quebrar) -> legado", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: undefined,
    },
    async () => {
      assert.equal(
        await resolver.isEnabledFor({ userId: "user-que-nao-existe" }),
        false,
      );
    },
  );
});
