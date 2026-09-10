import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import {
  type CandidateSignal,
  TalentIdentityResolver,
} from "./talent-identity-resolver";

const prisma = new PrismaClient();

function emailSignal(
  value: string,
  sourceRecordId = randomUUID(),
): CandidateSignal {
  return {
    signalType: "EMAIL",
    normalizedValue: value,
    confidence: "STRONG_MATCH",
    provenance: "EXTRACTED_REGEX",
    sourceRecordType: "AnalysisCvSnapshot",
    sourceRecordId,
  };
}

async function makeSubject() {
  const subject = await prisma.talentSubject.create({ data: {} });
  return subject.id;
}

// talent_profile_requires_owner (migration 20260904222812) é NOT VALID —
// não escaneia linhas EXISTENTES, mas passa a valer pra todo INSERT/UPDATE
// novo a partir dali, inclusive via SQL cru. Não há mais nenhum jeito de
// criar uma linha legada sem dono no banco depois dessa migration — as 187
// linhas reais só existem porque foram criadas ANTES dela. Pra simular esse
// estado histórico em teste, remove a constraint, insere a linha "legada",
// e recoloca a constraint (mesmo texto da migration original) — nunca deixa
// o banco de teste sem a constraint entre testes (bloco try/finally).
async function withoutOwnerConstraint<T>(fn: () => Promise<T>): Promise<T> {
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "TalentProfile" DROP CONSTRAINT "talent_profile_requires_owner"`,
  );
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "TalentProfile" ADD CONSTRAINT "talent_profile_requires_owner" CHECK ("userId" IS NOT NULL OR "talentSubjectId" IS NOT NULL) NOT VALID`,
    );
  }
}

async function makeUser() {
  return prisma.user.create({
    data: {
      email: `talent-resolver+${randomUUID()}@earlycv.dev`,
      name: "Talent Resolver Test",
    },
  });
}

async function cleanupProfile(id: string) {
  await prisma.talentIdentityConflict
    .deleteMany({ where: { OR: [{ profileAId: id }, { profileBId: id }] } })
    .catch(() => undefined);
  await prisma.talentIdentitySignal
    .deleteMany({ where: { talentProfileId: id } })
    .catch(() => undefined);
  await prisma.talentProfile.delete({ where: { id } }).catch(() => undefined);
}

test("resolveForGuest creates a new profile when no signal matches anything", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-new+${randomUUID()}@example.com`;
  const sourceRecordId = randomUUID();
  const talentSubjectId = await makeSubject();

  const outcome = await resolver.resolveForGuest(
    [emailSignal(email, sourceRecordId)],
    talentSubjectId,
  );

  assert.equal(outcome.createdProfile, true);
  assert.equal(outcome.promotedToUser, false);
  assert.equal(outcome.conflicts, 0);
  assert.equal(outcome.requiresLegacyAdoption, false);

  const profile = await prisma.talentProfile.findUnique({
    where: { id: outcome.talentProfileId },
  });
  assert.equal(profile?.identityConfidence, "STRONG_MATCH");
  assert.equal(profile?.userId, null);
  assert.equal(profile?.talentSubjectId, talentSubjectId);
  assert.equal(profile?.originSourceRecordType, "AnalysisCvSnapshot");
  assert.equal(profile?.originSourceRecordId, sourceRecordId);

  await cleanupProfile(outcome.talentProfileId);
});

test("resolveForGuest re-run with the same email attaches to the same profile (idempotent)", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-repeat+${randomUUID()}@example.com`;

  const first = await resolver.resolveForGuest(
    [emailSignal(email)],
    await makeSubject(),
  );
  const second = await resolver.resolveForGuest(
    [emailSignal(email, randomUUID())],
    await makeSubject(),
  );

  assert.equal(second.talentProfileId, first.talentProfileId);
  assert.equal(second.createdProfile, false);

  const count = await prisma.talentProfile.count({
    where: { id: first.talentProfileId },
  });
  assert.equal(count, 1);

  await cleanupProfile(first.talentProfileId);
});

test("resolveForGuest never creates a TalentProfile without an owner (talent_profile_requires_owner)", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  // Sem NENHUM sinal (nem NAME_COMPOSITE) — o caso que quebrava antes da
  // correção (CHECK talent_profile_requires_owner).
  const outcome = await resolver.resolveForGuest([], await makeSubject());

  assert.equal(outcome.createdProfile, true);
  const profile = await prisma.talentProfile.findUnique({
    where: { id: outcome.talentProfileId },
  });
  assert.ok(
    profile?.talentSubjectId,
    "talentSubjectId deveria estar preenchido",
  );
  assert.equal(profile?.userId, null);

  await cleanupProfile(outcome.talentProfileId);
});

test("resolveForGuest adopts a legacy ownerless profile matched by strong signal (sinaliza requiresLegacyAdoption, nunca adota sozinho)", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-legacy+${randomUUID()}@example.com`;

  // Simula uma das 187 linhas legadas: TalentProfile sem NENHUM dono,
  // criado direto (bypassando o resolver), com um sinal já anexado. Só é
  // possível criar essa linha em teste suspendendo temporariamente a
  // constraint (ver withoutOwnerConstraint) — depois da migration
  // 20260904222812, nenhum INSERT novo consegue ficar sem dono, nem por
  // SQL cru.
  const legacyProfile = await withoutOwnerConstraint(() =>
    prisma.talentProfile.create({
      data: { identityConfidence: "STRONG_MATCH" },
    }),
  );
  await prisma.talentIdentitySignal.create({
    data: {
      talentProfileId: legacyProfile.id,
      signalType: "EMAIL",
      normalizedValue: email,
      confidence: "STRONG_MATCH",
      provenance: "EXTRACTED_REGEX",
      sourceRecordType: "AnalysisCvSnapshot",
      sourceRecordId: randomUUID(),
    },
  });

  const talentSubjectId = await makeSubject();
  const outcome = await resolver.resolveForGuest(
    [emailSignal(email, randomUUID())],
    talentSubjectId,
  );

  assert.equal(outcome.talentProfileId, legacyProfile.id);
  assert.equal(outcome.createdProfile, false);
  assert.equal(
    outcome.requiresLegacyAdoption,
    true,
    "resolver deveria sinalizar que o profile legado precisa de adoção",
  );

  // resolveForGuest sozinho NUNCA adota — só sinaliza. A linha continua
  // sem dono até o chamador (TalentSubjectService) agir.
  const stillOwnerless = await prisma.talentProfile.findUnique({
    where: { id: legacyProfile.id },
  });
  assert.equal(stillOwnerless?.userId, null);
  assert.equal(stillOwnerless?.talentSubjectId, null);

  await cleanupProfile(legacyProfile.id);
});

test("resolveForUser promotes an existing guest profile instead of creating a duplicate", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-to-user+${randomUUID()}@example.com`;
  const user = await makeUser();

  const guestOutcome = await resolver.resolveForGuest(
    [emailSignal(email)],
    await makeSubject(),
  );
  const userOutcome = await resolver.resolveForUser(user.id, [
    emailSignal(email, randomUUID()),
  ]);

  assert.equal(userOutcome.talentProfileId, guestOutcome.talentProfileId);
  assert.equal(userOutcome.promotedToUser, true);
  assert.equal(userOutcome.createdProfile, false);

  const profile = await prisma.talentProfile.findUnique({
    where: { id: userOutcome.talentProfileId },
  });
  assert.equal(profile?.userId, user.id);
  assert.equal(profile?.identityConfidence, "CONFIRMED_USER");

  await cleanupProfile(userOutcome.talentProfileId);
  await prisma.user.delete({ where: { id: user.id } });
});

test("conflicting STRONG signals across two different users never merge, and log a conflict", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const sharedEmail = `conflict+${randomUUID()}@example.com`;
  const userA = await makeUser();
  const userB = await makeUser();

  const outcomeA = await resolver.resolveForUser(userA.id, [
    emailSignal(sharedEmail),
  ]);
  const outcomeB = await resolver.resolveForUser(userB.id, [
    emailSignal(sharedEmail, randomUUID()),
  ]);

  assert.notEqual(outcomeA.talentProfileId, outcomeB.talentProfileId);
  assert.equal(outcomeB.conflicts, 1);

  const profileA = await prisma.talentProfile.findUnique({
    where: { id: outcomeA.talentProfileId },
  });
  const profileB = await prisma.talentProfile.findUnique({
    where: { id: outcomeB.talentProfileId },
  });
  assert.equal(profileA?.userId, userA.id);
  assert.equal(profileB?.userId, userB.id);

  const conflict = await prisma.talentIdentityConflict.findFirst({
    where: {
      OR: [
        { profileAId: outcomeA.talentProfileId },
        { profileBId: outcomeA.talentProfileId },
      ],
    },
  });
  assert.ok(conflict);
  assert.equal(conflict?.signalType, "EMAIL");

  await cleanupProfile(outcomeA.talentProfileId);
  await cleanupProfile(outcomeB.talentProfileId);
  await prisma.user.delete({ where: { id: userA.id } });
  await prisma.user.delete({ where: { id: userB.id } });
});

test("re-resolving the same conflicting pair does not log a duplicate conflict", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const sharedEmail = `conflict-rerun+${randomUUID()}@example.com`;
  const userA = await makeUser();
  const userB = await makeUser();

  const outcomeA = await resolver.resolveForUser(userA.id, [
    emailSignal(sharedEmail),
  ]);
  // Simula uma re-execução do backfill (ex: depois de uma interrupção) —
  // o mesmo snapshot de B é reprocessado e bate no mesmo conflito de novo.
  await resolver.resolveForUser(userB.id, [
    emailSignal(sharedEmail, randomUUID()),
  ]);
  const secondRunOutcomeB = await resolver.resolveForUser(userB.id, [
    emailSignal(sharedEmail, randomUUID()),
  ]);

  assert.equal(secondRunOutcomeB.conflicts, 0);

  const conflictCount = await prisma.talentIdentityConflict.count({
    where: {
      OR: [
        { profileAId: outcomeA.talentProfileId },
        { profileBId: outcomeA.talentProfileId },
      ],
    },
  });
  assert.equal(conflictCount, 1);

  const profileB = await prisma.talentProfile.findUnique({
    where: { userId: userB.id },
  });
  await cleanupProfile(outcomeA.talentProfileId);
  if (profileB) await cleanupProfile(profileB.id);
  await prisma.user.delete({ where: { id: userA.id } });
  await prisma.user.delete({ where: { id: userB.id } });
});

test("dry run never writes to the database", async () => {
  const resolver = new TalentIdentityResolver(prisma, true);
  const email = `dry-run+${randomUUID()}@example.com`;

  const outcome = await resolver.resolveForGuest(
    [emailSignal(email)],
    `dry-run-subject-${randomUUID()}`,
  );

  assert.equal(outcome.createdProfile, true);
  assert.equal(outcome.attachedSignals, 1);

  const signal = await prisma.talentIdentitySignal.findUnique({
    where: {
      signalType_normalizedValue: {
        signalType: "EMAIL",
        normalizedValue: email,
      },
    },
  });
  assert.equal(signal, null);
});

test("resolveForUser reuses the existing profile on a second call for the same user (idempotent)", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const user = await makeUser();
  const email = `user-repeat+${randomUUID()}@example.com`;

  const first = await resolver.resolveForUser(user.id, [emailSignal(email)]);
  const second = await resolver.resolveForUser(user.id, [
    emailSignal(`other+${randomUUID()}@example.com`, randomUUID()),
  ]);

  assert.equal(second.talentProfileId, first.talentProfileId);
  assert.equal(second.createdProfile, false);

  await cleanupProfile(first.talentProfileId);
  await prisma.user.delete({ where: { id: user.id } });
});

test("teardown: disconnect the shared prisma client", async () => {
  await prisma.$disconnect();
});
