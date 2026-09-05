import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import {
  shouldSkipEnrichment,
  TalentProfileCaptureService,
} from "./talent-profile-capture.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const talentSubjectService = new TalentSubjectService(database);
const service = new TalentProfileCaptureService(database, talentSubjectService);

// Marca o início da bateria de testes deste arquivo — o teste de
// invariante ao final filtra por createdAt > este instante, pra nunca ser
// afetado pelas 187 linhas legadas sem dono que já existem antes desta
// migration (earlycv_test pode ou não tê-las, dependendo do snapshot da
// base local — o filtro por tempo torna o teste correto nos dois casos).
const invariantWindowStart = new Date();

async function waitForCapture() {
  // fire-and-forget: espera a run() interna terminar antes de checar.
  await new Promise((resolve) => setTimeout(resolve, 500));
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

// talent_profile_requires_owner (migration 20260904222812) é NOT VALID —
// não escaneia linhas existentes, mas passa a valer pra todo INSERT novo a
// partir dali (mesmo comentário em talent-identity-resolver.spec.ts). Só
// assim é possível simular uma linha legada em teste.
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

async function cleanupSubject(id: string) {
  await prisma.talentSubjectMergeEvent
    .deleteMany({ where: { talentSubjectId: id } })
    .catch(() => undefined);
  await prisma.talentSubjectSessionSignal
    .deleteMany({ where: { talentSubjectId: id } })
    .catch(() => undefined);
  await prisma.talentSubject.delete({ where: { id } }).catch(() => undefined);
}

function cvText(fullName: string, email: string, phone: string) {
  return `${fullName}\n${email} | ${phone}\n\nExperiencia com SQL e Python.`;
}

// Cada teste precisa de um telefone único também — reusar o mesmo número
// fixo entre execuções faz um profile órfão de uma run anterior (ex: uma
// falhou antes do cleanup) "grudar" sinais novos via esse telefone
// repetido, quebrando a asserção de forma confusa (achado depurando este
// próprio arquivo).
function randomPhone() {
  const digits = Math.floor(900000000 + Math.random() * 99999999).toString();
  return `(11) 9${digits.slice(0, 4)}-${digits.slice(4, 8)}`;
}

async function findProfileByGuestEmail(email: string) {
  const signal = await prisma.talentIdentitySignal.findUnique({
    where: {
      signalType_normalizedValue: {
        signalType: "EMAIL",
        normalizedValue: email,
      },
    },
  });
  return signal
    ? prisma.talentProfile.findUnique({ where: { id: signal.talentProfileId } })
    : null;
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
    text: cvText("Fulano Da Silva", email, randomPhone()),
    guestSessionHash: randomUUID(),
  });

  await waitForCapture();

  const profile = await findProfileByGuestEmail(email);
  assert.ok(profile, "profile deveria existir a partir do sinal EMAIL");
  assert.equal(profile?.userId, null);
  assert.ok(
    profile?.talentSubjectId,
    "guest profile deveria ter talentSubjectId",
  );
  assert.equal(profile?.fullName, "Fulano Da Silva");
  assert.equal(profile?.primaryEmail, email);

  if (profile) await cleanupProfile(profile.id);
  if (profile?.talentSubjectId) await cleanupSubject(profile.talentSubjectId);
});

test("captureFromSnapshot (guest SEM sinal forte, COM sessão): cria TalentSubject+TalentProfile sem violar talent_profile_requires_owner", async () => {
  const snapshotId = randomUUID();
  const guestSessionHash = randomUUID();

  service.captureFromSnapshot({
    snapshotId,
    userId: null,
    sourceType: "uploaded_file",
    text: "Texto de CV genérico, sem nome, email, telefone ou linkedin reconhecíveis.",
    guestSessionHash,
  });

  await waitForCapture();

  const signal = await prisma.talentSubjectSessionSignal.findUnique({
    where: { guestSessionHash },
  });
  assert.ok(signal, "TalentSubjectSessionSignal deveria ter sido criado");
  if (!signal) return;

  const profile = await prisma.talentProfile.findUnique({
    where: { talentSubjectId: signal.talentSubjectId },
  });
  assert.ok(profile, "TalentProfile deveria existir mesmo sem sinal forte");
  assert.equal(profile?.userId, null);
  assert.equal(profile?.talentSubjectId, signal.talentSubjectId);

  if (profile) await cleanupProfile(profile.id);
  await cleanupSubject(signal.talentSubjectId);
});

test("captureFromSnapshot (guest SEM sinal forte e SEM guestSessionHash): ainda cria TalentSubject anônimo, sem quebrar", async () => {
  const snapshotId = randomUUID();

  service.captureFromSnapshot({
    snapshotId,
    userId: null,
    sourceType: "uploaded_file",
    // Primeira linha é um NAME_COMPOSITE (sinal FRACO, nunca aciona merge
    // sozinho — ver talent-identity-resolver.ts) só pra dar ao teste um
    // jeito de localizar a linha via originSourceRecordId sem depender de
    // sessão. O ponto do teste é exatamente este: NENHUM sinal FORTE
    // (email/telefone/linkedin) presente, e mesmo assim sem quebrar.
    text: "Nome Generico Sem Sessao\nCV sem email, telefone ou linkedin reconhecível.",
    guestSessionHash: null,
  });

  await waitForCapture();

  // Sem sessão, o único jeito de achar a linha é via originSourceRecordId
  // (gravado na criação, ver comentário do campo em schema.prisma).
  const profile = await prisma.talentProfile.findFirst({
    where: { originSourceRecordId: snapshotId },
  });
  assert.ok(profile, "TalentProfile deveria existir mesmo sem sessão");
  assert.equal(profile.userId, null);
  assert.ok(
    profile.talentSubjectId,
    "talentSubjectId deveria estar preenchido (TalentSubject anônimo)",
  );
  const talentSubjectId = profile.talentSubjectId;
  if (!talentSubjectId) return;

  const subject = await prisma.talentSubject.findUnique({
    where: { id: talentSubjectId },
  });
  assert.ok(subject);
  const signalCount = await prisma.talentSubjectSessionSignal.count({
    where: { talentSubjectId },
  });
  assert.equal(
    signalCount,
    0,
    "sem sessão disponível, nenhum TalentSubjectSessionSignal deveria existir",
  );

  await cleanupProfile(profile.id);
  await cleanupSubject(talentSubjectId);
});

test("captureFromSnapshot: duas capturas concorrentes do MESMO guest (mesma sessão) resultam em um único TalentSubject e um único TalentProfile", async () => {
  const guestSessionHash = randomUUID();

  service.captureFromSnapshot({
    snapshotId: randomUUID(),
    userId: null,
    sourceType: "uploaded_file",
    text: "CV concorrente A, sem sinal forte de identidade.",
    guestSessionHash,
  });
  service.captureFromSnapshot({
    snapshotId: randomUUID(),
    userId: null,
    sourceType: "uploaded_file",
    text: "CV concorrente B, sem sinal forte de identidade.",
    guestSessionHash,
  });

  await waitForCapture();

  const signalCount = await prisma.talentSubjectSessionSignal.count({
    where: { guestSessionHash },
  });
  assert.equal(
    signalCount,
    1,
    "só um TalentSubjectSessionSignal deveria existir",
  );

  const signal = await prisma.talentSubjectSessionSignal.findUniqueOrThrow({
    where: { guestSessionHash },
  });
  const profileCount = await prisma.talentProfile.count({
    where: { talentSubjectId: signal.talentSubjectId },
  });
  assert.equal(
    profileCount,
    1,
    "só um TalentProfile deveria existir pro sujeito",
  );

  // Escopado por tempo (não é um count global): a base de teste pode ter
  // linhas legadas sem dono de outras execuções/simulações (ver
  // withoutOwnerConstraint) — o que importa aqui é que ESTA captura
  // concorrente não criou nenhuma linha nova sem dono.
  const ownerless = await prisma.talentProfile.count({
    where: {
      userId: null,
      talentSubjectId: null,
      createdAt: { gt: invariantWindowStart },
    },
  });
  assert.equal(ownerless, 0, "nenhum TalentProfile sem dono deveria existir");

  const profile = await prisma.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId: signal.talentSubjectId },
  });
  await cleanupProfile(profile.id);
  await cleanupSubject(signal.talentSubjectId);
});

test("captureFromSnapshot: retry da mesma captura (mesma sessão) não duplica TalentSubject/TalentProfile", async () => {
  const guestSessionHash = randomUUID();
  const snapshotId = randomUUID();
  const text = "CV reprocessado (retry), sem sinal forte de identidade.";

  // Primeira tentativa.
  service.captureFromSnapshot({
    snapshotId,
    userId: null,
    sourceType: "uploaded_file",
    text,
    guestSessionHash,
  });
  await waitForCapture();

  // Retry — mesmo AnalysisCvSnapshot (mesmo snapshotId), mesma sessão,
  // reprocessado (ex.: retry de rede/worker).
  service.captureFromSnapshot({
    snapshotId,
    userId: null,
    sourceType: "uploaded_file",
    text,
    guestSessionHash,
  });
  await waitForCapture();

  const subjectCount = await prisma.talentSubjectSessionSignal.count({
    where: { guestSessionHash },
  });
  assert.equal(subjectCount, 1, "retry não deveria duplicar o TalentSubject");

  const signal = await prisma.talentSubjectSessionSignal.findUniqueOrThrow({
    where: { guestSessionHash },
  });
  const profileCount = await prisma.talentProfile.count({
    where: { talentSubjectId: signal.talentSubjectId },
  });
  assert.equal(profileCount, 1, "retry não deveria duplicar o TalentProfile");

  const profile = await prisma.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId: signal.talentSubjectId },
  });
  await cleanupProfile(profile.id);
  await cleanupSubject(signal.talentSubjectId);
});

test("captureFromSnapshot: adota perfil legado sem dono encontrado por sinal forte, grava auditoria, idempotente", async () => {
  const email = `guest-legacy-capture+${randomUUID()}@example.com`;

  // Simula uma das 187 linhas legadas: TalentProfile sem NENHUM dono, já
  // com um sinal EMAIL anexado (produzido antes da correção desta fase).
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

  const guestSessionHash = randomUUID();
  service.captureFromSnapshot({
    snapshotId: randomUUID(),
    userId: null,
    sourceType: "uploaded_file",
    text: cvText("Legado Adotado", email, randomPhone()),
    guestSessionHash,
  });
  await waitForCapture();

  const adopted = await prisma.talentProfile.findUniqueOrThrow({
    where: { id: legacyProfile.id },
  });
  assert.ok(adopted.talentSubjectId, "perfil legado deveria ter sido adotado");
  assert.equal(adopted.userId, null);
  const talentSubjectId = adopted.talentSubjectId;
  assert.ok(talentSubjectId);

  const events = await prisma.talentSubjectMergeEvent.findMany({
    where: { talentSubjectId },
  });
  assert.equal(events.length, 1);
  assert.equal(events[0]?.reason, "LEGACY_PROFILE_ADOPTED");

  // Reprocessar (mesmo texto, nova análise da mesma pessoa) não deve
  // duplicar o evento nem trocar de sujeito.
  service.captureFromSnapshot({
    snapshotId: randomUUID(),
    userId: null,
    sourceType: "uploaded_file",
    text: cvText("Legado Adotado", email, randomPhone()),
    guestSessionHash: randomUUID(),
  });
  await waitForCapture();

  const adoptedAgain = await prisma.talentProfile.findUniqueOrThrow({
    where: { id: legacyProfile.id },
  });
  assert.equal(adoptedAgain.talentSubjectId, talentSubjectId);

  const eventsAfter = await prisma.talentSubjectMergeEvent.findMany({
    where: { talentSubjectId },
  });
  assert.equal(
    eventsAfter.length,
    1,
    "não deveria duplicar o evento de adoção",
  );

  await cleanupProfile(legacyProfile.id);
  await cleanupSubject(talentSubjectId);
});

test("invariante: nenhum TalentProfile NOVO (criado durante esta suíte) fica sem dono", async () => {
  const orphanCount = await prisma.talentProfile.count({
    where: {
      userId: null,
      talentSubjectId: null,
      createdAt: { gt: invariantWindowStart },
    },
  });
  assert.equal(
    orphanCount,
    0,
    "nenhum TalentProfile criado durante esta suíte deveria ficar sem dono",
  );
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

  const profile = await prisma.talentProfile.findUnique({
    where: { userId: user.id },
  });
  assert.ok(
    profile,
    "profile deveria existir a partir do userId, mesmo sem sinal extraido do texto",
  );
  assert.equal(profile?.primaryEmail, user.email.toLowerCase());

  if (profile) await cleanupProfile(profile.id);
  await prisma.user.delete({ where: { id: user.id } });
});

test("teardown: disconnect the shared prisma client", async () => {
  await prisma.$disconnect();
});
