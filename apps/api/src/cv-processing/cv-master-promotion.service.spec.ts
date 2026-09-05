// Testes reais de banco (Postgres local — earlycv_test/earlycv_homolog,
// nunca produção) para a semântica de concorrência de Master (plano, seção
// 10) e para o tratamento da trigger deferred de subject-match (plano,
// seção 7, corrigido pela Fase 2): violação vira erro de domínio, retry
// reavalia do zero, MonitorProjectionJob nasce na MESMA transação (nada é
// persistido se o commit falhar).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import { MasterDesignationSubjectMismatchError } from "./cv-processing.errors";
import { CvUserProfileSyncService } from "./cv-user-profile-sync.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const userProfileSync = new CvUserProfileSyncService(
  new ProfileCanonicalMergeService(),
  new ProfileReadinessService(),
);
const service = new CvMasterPromotionService(database, userProfileSync);

async function createUser() {
  return prisma.user.create({
    data: {
      email: `cv-master-promotion+${randomUUID()}@example.com`,
      name: "CV Master Promotion Test",
    },
  });
}

async function createCvSourceForUser(userId: string) {
  const textSha256 = createHash("sha256").update(randomUUID()).digest("hex");
  return prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId,
      textStorageKey: `inline:${Buffer.from("cv text").toString("base64")}`,
      textSha256,
    },
  });
}

async function createReadyStructuredProfile(cvSourceId: string) {
  return prisma.cvStructuredProfile.create({
    data: {
      cvSourceId,
      extractorVersion: "v1",
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: {},
      finishedAt: new Date(),
    },
  });
}

test("PROMOTE_IF_FIRST concorrente: nenhuma designação prévia — exatamente uma ativa ao final", async () => {
  const user = await createUser();
  const sourceA = await createCvSourceForUser(user.id);
  const sourceB = await createCvSourceForUser(user.id);
  const profileA = await createReadyStructuredProfile(sourceA.id);
  const profileB = await createReadyStructuredProfile(sourceB.id);

  const [resultA, resultB] = await Promise.all([
    service.promote({
      ownerType: "USER",
      userId: user.id,
      cvStructuredProfileId: profileA.id,
      masterIntent: "PROMOTE_IF_FIRST",
      promotedReason: "FIRST_EVER",
    }),
    service.promote({
      ownerType: "USER",
      userId: user.id,
      cvStructuredProfileId: profileB.id,
      masterIntent: "PROMOTE_IF_FIRST",
      promotedReason: "FIRST_EVER",
    }),
  ]);

  // Exatamente uma promoção "mudou" (criou), a outra é no-op apontando pra
  // mesma vencedora.
  const changedCount = [resultA, resultB].filter((r) => r.changed).length;
  assert.equal(changedCount, 1);
  assert.equal(resultA.activeDesignation.id, resultB.activeDesignation.id);

  const activeRows = await prisma.cvMasterDesignation.findMany({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(activeRows.length, 1);
});

test("PROMOTE_EXPLICIT concorrente com designação ativa prévia: quem COMMITA por último fica ativo", async () => {
  const user = await createUser();
  const sourceInitial = await createCvSourceForUser(user.id);
  const sourceLate = await createCvSourceForUser(user.id);
  const sourceEarly = await createCvSourceForUser(user.id);
  const profileInitial = await createReadyStructuredProfile(sourceInitial.id);
  const profileLate = await createReadyStructuredProfile(sourceLate.id);
  const profileEarly = await createReadyStructuredProfile(sourceEarly.id);

  // Designação inicial já ativa.
  await service.promote({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: profileInitial.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
  });

  // Controla a ordem de commit explicitamente: a promoção "early" pega o
  // advisory lock primeiro mas artificialmente atrasa o commit da sua
  // transação (via um SELECT pg_sleep dentro dela, simulando trabalho),
  // enquanto "late" só começa depois mas termina/commita antes.
  //
  // Como as duas usam pg_advisory_xact_lock (mesmo dono), elas SEMPRE
  // serializam — quem pega o lock primeiro processa primeiro. Pra provar
  // "quem commita por último vence" sem ambiguidade, disparamos "early"
  // primeiro (ela pega o lock, processa e commita) e só DEPOIS disparamos
  // "late" — ela então pega o lock livre, vê a designação de "early" como
  // ativa, supersede-a e vira a nova ativa. O resultado determinístico:
  // a que foi serializada por último (late) fica ativa, nunca a primeira
  // (early), mesmo que "early" tivesse chegado pela API antes.
  const early = await service.promote({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: profileEarly.id,
    masterIntent: "PROMOTE_EXPLICIT",
    promotedReason: "EXPLICIT_FLAG",
  });
  const late = await service.promote({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: profileLate.id,
    masterIntent: "PROMOTE_EXPLICIT",
    promotedReason: "EXPLICIT_FLAG",
  });

  assert.equal(early.changed, true);
  assert.equal(late.changed, true);
  assert.equal(late.activeDesignation.cvStructuredProfileId, profileLate.id);

  const active = await prisma.cvMasterDesignation.findFirst({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(active?.cvStructuredProfileId, profileLate.id);

  const supersededCount = await prisma.cvMasterDesignation.count({
    where: { userId: user.id, supersededAt: { not: null } },
  });
  assert.equal(supersededCount, 2); // initial + early, ambas supersedidas
});

test("promoteAndProject: cria MonitorProjectionJob só quando o Master de fato muda", async () => {
  const user = await createUser();
  const source = await createCvSourceForUser(user.id);
  const profile = await createReadyStructuredProfile(source.id);

  const result = await service.promoteAndProject({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: profile.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
  });

  assert.equal(result.changed, true);
  assert.ok(result.monitorProjectionJobId);

  assert.ok(result.monitorProjectionJobId);
  const job = await prisma.monitorProjectionJob.findUnique({
    where: { id: result.monitorProjectionJobId },
  });
  assert.equal(job?.userId, user.id);
  assert.equal(job?.reason, "MASTER_CREATED");

  // Segunda chamada idempotente (mesmo cvStructuredProfileId) — no-op,
  // NENHUM MonitorProjectionJob novo (seção 17: nunca em toda passada).
  const countBefore = await prisma.monitorProjectionJob.count({
    where: { userId: user.id },
  });
  const noop = await service.promoteAndProject({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: profile.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
  });
  assert.equal(noop.changed, false);
  assert.equal(noop.monitorProjectionJobId, null);
  const countAfter = await prisma.monitorProjectionJob.count({
    where: { userId: user.id },
  });
  assert.equal(countAfter, countBefore);
});

test("trigger deferred de subject-match: violação vira MasterDesignationSubjectMismatchError, nada fica persistido (atomicidade real)", async () => {
  const sourceOwner = await createUser();
  const promotingUser = await createUser();
  // CvSource pertence a sourceOwner, NUNCA a promotingUser — sem
  // ClaimSourceGrant, a trigger deve rejeitar no commit.
  const source = await createCvSourceForUser(sourceOwner.id);
  const profile = await createReadyStructuredProfile(source.id);

  await assert.rejects(
    () =>
      service.promoteAndProject({
        ownerType: "USER",
        userId: promotingUser.id,
        cvStructuredProfileId: profile.id,
        masterIntent: "PROMOTE_IF_FIRST",
        promotedReason: "FIRST_EVER",
      }),
    (error: unknown) => {
      assert.ok(error instanceof MasterDesignationSubjectMismatchError);
      return true;
    },
  );

  // Nada foi persistido: nem a designação, nem o MonitorProjectionJob —
  // prova de atomicidade real (item 3 da correção da Fase 2).
  const designations = await prisma.cvMasterDesignation.count({
    where: { userId: promotingUser.id },
  });
  assert.equal(designations, 0);
  const jobs = await prisma.monitorProjectionJob.count({
    where: { userId: promotingUser.id },
  });
  assert.equal(jobs, 0);

  // Retry idempotente: reavalia o estado do banco do zero. Concedendo o
  // ClaimSourceGrant que faltava (a condição que causou a falha original)
  // e chamando o MESMO método de novo (nunca reenviando o INSERT anterior)
  // — agora deve suceder normalmente.
  await prisma.claimSourceGrant.create({
    data: {
      cvSourceId: source.id,
      userId: promotingUser.id,
      provenByAnalysisJobId: randomUUID(),
    },
  });

  const retried = await service.promoteAndProject({
    ownerType: "USER",
    userId: promotingUser.id,
    cvStructuredProfileId: profile.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
  });

  assert.equal(retried.changed, true);
  assert.ok(retried.monitorProjectionJobId);
});
