import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  shouldSkipEnrichment,
  TalentProfileCaptureService,
} from "./talent-profile-capture.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const service = new TalentProfileCaptureService(database);

async function cleanupProfile(id: string) {
  await prisma.talentIdentityConflict
    .deleteMany({ where: { OR: [{ profileAId: id }, { profileBId: id }] } })
    .catch(() => undefined);
  await prisma.talentIdentitySignal
    .deleteMany({ where: { talentProfileId: id } })
    .catch(() => undefined);
  await prisma.talentProfile.delete({ where: { id } }).catch(() => undefined);
}

function cvText(fullName: string, email: string, phone: string) {
  return `${fullName}\n${email} | ${phone}\n\nExperiencia com SQL e Python.`;
}

async function findProfileByGuestEmail(email: string) {
  const signal = await prisma.talentIdentitySignal.findUnique({
    where: { signalType_normalizedValue: { signalType: "EMAIL", normalizedValue: email } },
  });
  return signal ? prisma.talentProfile.findUnique({ where: { id: signal.talentProfileId } }) : null;
}

test("shouldSkipEnrichment: avulso nunca sobrescreve enriquecimento vindo de master", () => {
  const skip = shouldSkipEnrichment(
    { lastEnrichedSourceType: "master", lastEnrichedSourceId: "snap-old" },
    { sourceType: "uploaded_file", snapshotId: "snap-new" },
  );
  assert.equal(skip, true);
});

test("shouldSkipEnrichment: master sempre roda, mesmo com enriquecimento master anterior", () => {
  const skip = shouldSkipEnrichment(
    { lastEnrichedSourceType: "master", lastEnrichedSourceId: "snap-old" },
    { sourceType: "master_resume", snapshotId: "snap-new" },
  );
  assert.equal(skip, false);
});

test("shouldSkipEnrichment: avulso roda quando ainda nao ha enriquecimento de master", () => {
  const skip = shouldSkipEnrichment(
    { lastEnrichedSourceType: "avulso", lastEnrichedSourceId: "snap-old" },
    { sourceType: "uploaded_file", snapshotId: "snap-new" },
  );
  assert.equal(skip, false);
});

test("shouldSkipEnrichment: nunca reprocessa o mesmo snapshot duas vezes", () => {
  const skip = shouldSkipEnrichment(
    { lastEnrichedSourceType: "avulso", lastEnrichedSourceId: "snap-same" },
    { sourceType: "uploaded_file", snapshotId: "snap-same" },
  );
  assert.equal(skip, true);
});

test("captureFromSnapshot (guest): cria profile e sinal de identidade a partir do texto", async () => {
  const email = `guest-capture+${randomUUID()}@example.com`;
  const snapshotId = randomUUID();

  service.captureFromSnapshot({
    snapshotId,
    userId: null,
    sourceType: "uploaded_file",
    text: cvText("Fulano Da Silva", email, "(11) 98765-4321"),
  });

  // fire-and-forget: espera a run() interna terminar antes de checar.
  await new Promise((resolve) => setTimeout(resolve, 500));

  const profile = await findProfileByGuestEmail(email);
  assert.ok(profile, "profile deveria existir a partir do sinal EMAIL");
  assert.equal(profile?.userId, null);
  assert.equal(profile?.fullName, "Fulano Da Silva");
  assert.equal(profile?.primaryEmail, email);

  if (profile) await cleanupProfile(profile.id);
});

test("captureFromSnapshot (usuario autenticado): resolve pelo userId e usa sinal de conta", async () => {
  const user = await prisma.user.create({
    data: {
      email: `talent-capture+${randomUUID()}@earlycv.dev`,
      name: "Talent Capture Test",
    },
  });
  const snapshotId = randomUUID();

  service.captureFromSnapshot({
    snapshotId,
    userId: user.id,
    sourceType: "uploaded_file",
    text: "Texto de CV sem cabecalho reconhecivel de contato.",
  });

  await new Promise((resolve) => setTimeout(resolve, 500));

  const profile = await prisma.talentProfile.findUnique({ where: { userId: user.id } });
  assert.ok(profile, "profile deveria existir a partir do userId, mesmo sem sinal extraido do texto");
  assert.equal(profile?.primaryEmail, user.email.toLowerCase());

  if (profile) await cleanupProfile(profile.id);
  await prisma.user.delete({ where: { id: user.id } });
});

test("teardown: disconnect the shared prisma client", async () => {
  await prisma.$disconnect();
});
