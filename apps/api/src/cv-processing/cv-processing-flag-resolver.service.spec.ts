// Testes reais de banco (Postgres local) da resolução centralizada de
// ativação granular do pipeline canônico de CV — Fase 3 (pré-rollout) e
// Fase 3C item 6 (piloto guest+claim),
// docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, "Tarefa 2" /
// "6. Pilotar guest e claim".
//
// Cobre exatamente os cenários obrigatórios do plano:
//  - usuário fora da allowlist, flag global desligada -> sempre legado;
//  - usuário admin, flag global desligada -> pipeline novo;
//  - usuário comum na allowlist, flag global desligada -> pipeline novo;
//  - usuário comum fora da allowlist -> legado, mesmo se outro usuário
//    estiver na allowlist;
//  - guest (sem userId) sem hash na allowlist de guest -> sempre legado,
//    mesmo com a flag global ligada (Fase 3C: guest nunca liga pela flag
//    global sozinha — só pela allowlist de guestSessionHash);
//  - guest com guestSessionHash na allowlist de guest -> pipeline novo,
//    mesmo com a flag global desligada.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  CvProcessingFlagResolverService,
  isGuestSessionHashInPipelineAllowlist,
  parsePipelineAllowlistGuestSessionHashes,
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

test("resolver: guest (sem userId) sem hash na allowlist -> legado, mesmo com o usuário-alvo na allowlist de userId ou a flag global desligada", async () => {
  const user = await createUser("none");
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: user.id,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES: undefined,
    },
    async () => {
      assert.equal(await resolver.isEnabledFor({}), false);
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "hash-qualquer" }),
        false,
      );
    },
  );
});

// Fase 3C, item 6 — decisão fechada e testada aqui: a flag global sozinha
// NUNCA liga o pipeline para guest (mudança de comportamento em relação à
// Fase 3 original, documentada em cv-processing-flag-resolver.service.ts).
// Isso é o núcleo da exigência "impossível ativar acidentalmente todos os
// guests" — sem este teste, uma regressão futura reacoplando guest à flag
// global passaria despercebida.
test("resolver: flag global ligada -> liga para usuário autenticado, mas NUNCA para guest sozinha (guest exige hash na allowlist específica)", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: "true",
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES: undefined,
    },
    async () => {
      assert.equal(await resolver.isEnabledFor({}), false);
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "hash-nao-listado" }),
        false,
      );
      const user = await createUser("none");
      assert.equal(await resolver.isEnabledFor({ userId: user.id }), true);
    },
  );
});

test("parsePipelineAllowlistGuestSessionHashes: parsing puro — separa por vírgula, ignora vazios/espaços, sem curinga", () => {
  assert.deepEqual(
    [...parsePipelineAllowlistGuestSessionHashes(undefined)],
    [],
  );
  assert.deepEqual([...parsePipelineAllowlistGuestSessionHashes("")], []);
  assert.deepEqual([...parsePipelineAllowlistGuestSessionHashes("  ,  ,")], []);
  assert.deepEqual(
    [
      ...parsePipelineAllowlistGuestSessionHashes("hash-1, hash-2 ,,hash-3"),
    ].sort(),
    ["hash-1", "hash-2", "hash-3"],
  );
  // "*" nunca é tratado como curinga — vira literalmente a string "*",
  // que nunca bate com um hash real de sessão.
  assert.equal(isGuestSessionHashInPipelineAllowlist("qualquer-coisa"), false);
});

test("resolver: guest com guestSessionHash NA allowlist de guest -> pipeline novo, mesmo com a flag global desligada e sem allowlist de userId", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES:
        "outro-hash,session-hash-piloto,mais-um-hash",
    },
    async () => {
      assert.equal(
        await resolver.isEnabledFor({
          guestSessionHash: "session-hash-piloto",
        }),
        true,
      );
    },
  );
});

test("resolver: guest com guestSessionHash FORA da allowlist de guest -> legado, mesmo com outro hash na allowlist e a flag global ligada", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: "true",
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES:
        "hash-permitido",
    },
    async () => {
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "hash-diferente" }),
        false,
      );
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "hash-permitido" }),
        true,
      );
    },
  );
});

test("resolver: allowlist de guest vazia por padrão -> nenhum guest é ligado, nem com userId genérico coincidindo por acidente", async () => {
  await withEnv(
    {
      CV_STRUCTURED_PROFILE_PIPELINE_ENABLED: undefined,
      CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES: undefined,
    },
    async () => {
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "" }),
        false,
      );
      assert.equal(
        await resolver.isEnabledFor({ guestSessionHash: "*" }),
        false,
      );
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
