import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "node:test";

import * as argon2 from "argon2";

import { AuthService } from "./auth.service";

// Testes de UNIDADE (sem banco): garantem QUANDO os ganchos de
// relacionamento disparam. A criação das linhas em si é coberta em
// email-dispatch.service.spec.ts.

function createEnqueueSpy(options: { throws?: boolean } = {}) {
  const calls: string[] = [];
  return {
    calls,
    enqueueRelationshipForVerifiedUser: async (userId: string) => {
      calls.push(userId);
      if (options.throws) throw new Error("enqueue exploded");
      return { welcome: true, feedback: true };
    },
  };
}

function buildService(
  database: unknown,
  enqueue: ReturnType<typeof createEnqueueSpy> | undefined,
) {
  return new AuthService(
    database as never,
    {} as never,
    {} as never,
    { send: async () => ({}) } as never,
    undefined,
    undefined,
    enqueue,
  );
}

async function verifyFixture(options: {
  alreadyVerified?: boolean;
  throws?: boolean;
  noEnqueue?: boolean;
}) {
  const code = "123456";
  const codeHash = await argon2.hash(code);
  const baseUser = {
    id: "user_1",
    email: "maria@example.com",
    name: "Maria",
    planType: "free",
    status: "active",
    isStaff: false,
    internalRole: "none",
    emailVerifiedAt: options.alreadyVerified ? new Date() : null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const database = {
    user: { findUnique: async () => baseUser },
    emailVerificationChallenge: {
      findFirst: async () => ({
        id: "ch_1",
        codeHash,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    },
    $transaction: async (callback: (tx: unknown) => unknown) =>
      callback({
        emailVerificationChallenge: { update: async () => ({}) },
        user: {
          update: async () => ({ ...baseUser, emailVerifiedAt: new Date() }),
        },
      }),
  };
  const enqueue = options.noEnqueue
    ? undefined
    : createEnqueueSpy({ throws: options.throws });

  return { service: buildService(database, enqueue), enqueue, code };
}

test("verifyEmail enqueues relationship emails exactly once, only after a real verification", async () => {
  const { service, enqueue, code } = await verifyFixture({});

  const user = await service.verifyEmail("user_1", { code });

  assert.ok(user.emailVerifiedAt);
  assert.deepEqual(enqueue?.calls, ["user_1"]);
});

test("verifyEmail on an already-verified user never enqueues (verifying twice does not duplicate)", async () => {
  const { service, enqueue, code } = await verifyFixture({
    alreadyVerified: true,
  });

  await service.verifyEmail("user_1", { code });

  assert.deepEqual(enqueue?.calls, []);
});

test("verifyEmail with a wrong code never enqueues", async () => {
  const { service, enqueue } = await verifyFixture({});

  await assert.rejects(() => service.verifyEmail("user_1", { code: "000000" }));

  assert.deepEqual(enqueue?.calls, []);
});

test("an enqueue failure never breaks e-mail verification", async () => {
  const { service, code } = await verifyFixture({ throws: true });

  const user = await service.verifyEmail("user_1", { code });

  assert.ok(user.emailVerifiedAt);
});

test("AuthService works without the dispatch dependency (older construction)", async () => {
  const { service, code } = await verifyFixture({ noEnqueue: true });

  const user = await service.verifyEmail("user_1", { code });

  assert.ok(user.emailVerifiedAt);
});

test("register does NOT enqueue: signup with password never triggers relationship before verification", async () => {
  const created = {
    id: "user_new",
    email: "new@example.com",
    name: "New",
    status: "active",
    emailVerifiedAt: null,
  };
  const enqueue = createEnqueueSpy();
  const database = {
    user: {
      findUnique: async (args: { where: { id?: string; email?: string } }) =>
        args.where.id ? created : null,
      create: async () => created,
    },
  };
  const service = buildService(database, enqueue);
  // Isola o que importa: nada além de criar usuário, emitir o código e a
  // sessão (todos fora do escopo deste teste).
  // biome-ignore lint/suspicious/noExplicitAny: seam de teste em método privado
  (service as any).issueEmailVerificationChallenge = async () => {};
  // biome-ignore lint/suspicious/noExplicitAny: seam de teste em método privado
  (service as any).issueSession = async () => ({});

  await service.register({
    email: "new@example.com",
    password: "a-strong-password-123",
    name: "New",
  } as never);

  assert.deepEqual(enqueue.calls, []);
});

function socialFixture(options: { existingUserByEmail: boolean }) {
  const enqueue = createEnqueueSpy();
  const tx = {
    authAccount: {
      findUnique: async () => null,
      upsert: async () => ({ userId: "user_g" }),
    },
    user: {
      findUnique: async () =>
        options.existingUserByEmail ? { id: "user_g" } : null,
      upsert: async () => ({ id: "user_g" }),
    },
  };
  const database = {
    $transaction: async (callback: (t: unknown) => unknown) => callback(tx),
  };
  const service = buildService(database, enqueue);
  // biome-ignore lint/suspicious/noExplicitAny: seam de teste em método privado
  (service as any).issueSession = async () => ({});
  // biome-ignore lint/suspicious/noExplicitAny: seam de teste em método privado
  (service as any).recordSignupCompleted = async () => {};
  // biome-ignore lint/suspicious/noExplicitAny: seam de teste em método privado
  (service as any).recordLoginCompleted = async () => {};
  return { service, enqueue };
}

const googleProfile = {
  provider: "google" as const,
  providerAccountId: "g-123",
  email: "gina@example.com",
  name: "Gina",
  emailVerified: true,
};

test("Google: a REALLY new user enqueues relationship emails once", async () => {
  const { service, enqueue } = socialFixture({ existingUserByEmail: false });

  await service.finishSocialLogin(googleProfile);

  assert.deepEqual(enqueue.calls, ["user_g"]);
});

test("Google: an existing account (same e-mail already registered) NEVER gets a welcome/feedback", async () => {
  const { service, enqueue } = socialFixture({ existingUserByEmail: true });

  await service.finishSocialLogin(googleProfile);

  assert.deepEqual(enqueue.calls, []);
});
