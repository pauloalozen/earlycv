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

  const outcome = await resolver.resolveForGuest([emailSignal(email)]);

  assert.equal(outcome.createdProfile, true);
  assert.equal(outcome.promotedToUser, false);
  assert.equal(outcome.conflicts, 0);

  const profile = await prisma.talentProfile.findUnique({
    where: { id: outcome.talentProfileId },
  });
  assert.equal(profile?.identityConfidence, "STRONG_MATCH");
  assert.equal(profile?.userId, null);

  await cleanupProfile(outcome.talentProfileId);
});

test("resolveForGuest re-run with the same email attaches to the same profile (idempotent)", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-repeat+${randomUUID()}@example.com`;

  const first = await resolver.resolveForGuest([emailSignal(email)]);
  const second = await resolver.resolveForGuest([
    emailSignal(email, randomUUID()),
  ]);

  assert.equal(second.talentProfileId, first.talentProfileId);
  assert.equal(second.createdProfile, false);

  const count = await prisma.talentProfile.count({
    where: { id: first.talentProfileId },
  });
  assert.equal(count, 1);

  await cleanupProfile(first.talentProfileId);
});

test("resolveForUser promotes an existing guest profile instead of creating a duplicate", async () => {
  const resolver = new TalentIdentityResolver(prisma, false);
  const email = `guest-to-user+${randomUUID()}@example.com`;
  const user = await makeUser();

  const guestOutcome = await resolver.resolveForGuest([emailSignal(email)]);
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

test("dry run never writes to the database", async () => {
  const resolver = new TalentIdentityResolver(prisma, true);
  const email = `dry-run+${randomUUID()}@example.com`;

  const outcome = await resolver.resolveForGuest([emailSignal(email)]);

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
