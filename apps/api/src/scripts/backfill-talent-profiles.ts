// Backfill da Base de Talentos (EarlySignal) — fase 1 (ver AGENTS.md "v3.2").
//
// Cria/enriquece TalentProfile a partir do que já existe hoje:
//   1. Usuários cadastrados (User + UserProfile) — sempre CONFIRMED_USER.
//   2. AnalysisCvSnapshot já ligado a um usuário — enriquece o profile do
//      passo 1 com sinais extraídos por regex do texto do CV.
//   3. AnalysisCvSnapshot de guest (sem userId) — resolve/deduplica por
//      email/telefone/LinkedIn extraídos por regex; nunca funde só por
//      nome (ver TalentIdentityResolver).
//
// Idempotente: chaves únicas (userId no profile, (signalType,
// normalizedValue) no signal) garantem que rodar de novo não duplica nada.
//
// Por padrão roda em --dry-run (só lê e reporta, nunca escreve). Passe
// --apply pra gravar de verdade.
//
//   npm run talent:backfill-profiles --workspace @earlycv/api
//   npm run talent:backfill-profiles --workspace @earlycv/api -- --apply

import { PrismaClient } from "@prisma/client";

import { StorageService } from "../storage/storage.service";
import {
  extractContactSignalsFromText,
  normalizeEmail,
  normalizeLinkedinHandle,
  normalizePhone,
} from "../talent-profiles/talent-identity.util";
import {
  type CandidateSignal,
  TalentIdentityResolver,
} from "../talent-profiles/talent-identity-resolver";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;

type Counters = {
  usersProcessed: number;
  userProfilesCreated: number;
  userProfilesPromoted: number;
  userProfilesExisting: number;
  snapshotsLinkedProcessed: number;
  snapshotsGuestProcessed: number;
  guestProfilesCreated: number;
  guestProfilesStrongMatch: number;
  guestProfilesUnverified: number;
  guestProfilesAttachedToExisting: number;
  signalsAttached: number;
  conflictsDetected: number;
  snapshotsSkippedNoText: number;
};

function emptyCounters(): Counters {
  return {
    usersProcessed: 0,
    userProfilesCreated: 0,
    userProfilesPromoted: 0,
    userProfilesExisting: 0,
    snapshotsLinkedProcessed: 0,
    snapshotsGuestProcessed: 0,
    guestProfilesCreated: 0,
    guestProfilesStrongMatch: 0,
    guestProfilesUnverified: 0,
    guestProfilesAttachedToExisting: 0,
    signalsAttached: 0,
    conflictsDetected: 0,
    snapshotsSkippedNoText: 0,
  };
}

function buildAccountSignals(
  userId: string,
  email: string,
  profile: {
    contactEmail: string | null;
    phone: string | null;
    linkedinUrl: string | null;
  } | null,
): CandidateSignal[] {
  const signals: CandidateSignal[] = [];

  const accountEmail = normalizeEmail(email);
  if (accountEmail) {
    signals.push({
      signalType: "EMAIL",
      normalizedValue: accountEmail,
      confidence: "CONFIRMED_USER",
      provenance: "DECLARED_BY_USER",
      sourceRecordType: "User",
      sourceRecordId: userId,
    });
  }

  const contactEmail = normalizeEmail(profile?.contactEmail);
  if (contactEmail && contactEmail !== accountEmail) {
    signals.push({
      signalType: "EMAIL",
      normalizedValue: contactEmail,
      confidence: "STRONG_MATCH",
      provenance: "DECLARED_BY_USER",
      sourceRecordType: "UserProfile",
      sourceRecordId: userId,
    });
  }

  const phone = normalizePhone(profile?.phone);
  if (phone) {
    signals.push({
      signalType: "PHONE",
      normalizedValue: phone,
      confidence: "STRONG_MATCH",
      provenance: "DECLARED_BY_USER",
      sourceRecordType: "UserProfile",
      sourceRecordId: userId,
    });
  }

  const linkedin = normalizeLinkedinHandle(profile?.linkedinUrl);
  if (linkedin) {
    signals.push({
      signalType: "LINKEDIN",
      normalizedValue: linkedin,
      confidence: "STRONG_MATCH",
      provenance: "DECLARED_BY_USER",
      sourceRecordType: "UserProfile",
      sourceRecordId: userId,
    });
  }

  return signals;
}

function buildExtractedSignals(
  sourceRecordId: string,
  extracted: ReturnType<typeof extractContactSignalsFromText>,
): CandidateSignal[] {
  const signals: CandidateSignal[] = [];
  const base = {
    confidence: "STRONG_MATCH" as const,
    provenance: "EXTRACTED_REGEX" as const,
    sourceRecordType: "AnalysisCvSnapshot",
    sourceRecordId,
  };

  const email = normalizeEmail(extracted.email);
  if (email)
    signals.push({ ...base, signalType: "EMAIL", normalizedValue: email });

  const phone = normalizePhone(extracted.phone);
  if (phone)
    signals.push({ ...base, signalType: "PHONE", normalizedValue: phone });

  const linkedin = normalizeLinkedinHandle(extracted.linkedinUrl);
  if (linkedin)
    signals.push({
      ...base,
      signalType: "LINKEDIN",
      normalizedValue: linkedin,
    });

  if (extracted.fullName) {
    signals.push({
      ...base,
      signalType: "NAME_COMPOSITE",
      normalizedValue: extracted.fullName.trim().toLowerCase(),
    });
  }

  return signals;
}

// Preenche o cache de leitura do profile só na criação, só campos vazios —
// nunca sobrescreve dado já resolvido. Recalculo completo/agregado fica
// pra fase 2 (enriquecimento IA + agregação).
async function seedProfileCache(
  prisma: PrismaClient,
  talentProfileId: string,
  data: {
    fullName?: string | null;
    primaryEmail?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
  },
) {
  if (DRY_RUN || talentProfileId.startsWith("dry-run-")) return;

  const profile = await prisma.talentProfile.findUnique({
    where: { id: talentProfileId },
  });
  if (!profile) return;

  const patch: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value && !profile[key as keyof typeof profile]) {
      patch[key] = value;
    }
  }
  if (Object.keys(patch).length === 0) return;

  await prisma.talentProfile.update({
    where: { id: talentProfileId },
    data: patch,
  });
}

async function processUsers(
  prisma: PrismaClient,
  resolver: TalentIdentityResolver,
  counters: Counters,
) {
  const users = await prisma.user.findMany({
    where: { isStaff: false },
    select: {
      id: true,
      email: true,
      name: true,
      profile: {
        select: {
          contactEmail: true,
          phone: true,
          linkedinUrl: true,
          city: true,
          state: true,
          country: true,
        },
      },
    },
  });

  for (const user of users) {
    counters.usersProcessed += 1;
    const signals = buildAccountSignals(user.id, user.email, user.profile);
    const outcome = await resolver.resolveForUser(user.id, signals);

    counters.signalsAttached += outcome.attachedSignals;
    counters.conflictsDetected += outcome.conflicts;
    if (outcome.createdProfile) counters.userProfilesCreated += 1;
    else if (outcome.promotedToUser) counters.userProfilesPromoted += 1;
    else counters.userProfilesExisting += 1;

    if (outcome.createdProfile || outcome.promotedToUser) {
      await seedProfileCache(prisma, outcome.talentProfileId, {
        fullName: user.name,
        primaryEmail: normalizeEmail(user.email),
        phone: normalizePhone(user.profile?.phone),
        linkedinUrl: user.profile?.linkedinUrl,
        city: user.profile?.city,
        state: user.profile?.state,
        country: user.profile?.country,
      });
    }
  }
}

async function loadSnapshotText(
  storage: StorageService,
  textStorageKey: string,
): Promise<string | null> {
  try {
    const buffer = await storage.getObject(textStorageKey);
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

async function processLinkedSnapshots(
  prisma: PrismaClient,
  storage: StorageService,
  resolver: TalentIdentityResolver,
  counters: Counters,
) {
  const snapshots = await prisma.analysisCvSnapshot.findMany({
    where: { userId: { not: null } },
    select: { id: true, userId: true, textStorageKey: true },
  });

  for (const snapshot of snapshots) {
    if (!snapshot.userId) continue;
    counters.snapshotsLinkedProcessed += 1;

    const text = await loadSnapshotText(storage, snapshot.textStorageKey);
    if (!text) {
      counters.snapshotsSkippedNoText += 1;
      continue;
    }

    const extracted = extractContactSignalsFromText(text);
    const signals = buildExtractedSignals(snapshot.id, extracted);
    if (signals.length === 0) continue;

    const outcome = await resolver.resolveForUser(snapshot.userId, signals);
    counters.signalsAttached += outcome.attachedSignals;
    counters.conflictsDetected += outcome.conflicts;
  }
}

async function processGuestSnapshots(
  prisma: PrismaClient,
  storage: StorageService,
  resolver: TalentIdentityResolver,
  counters: Counters,
) {
  const snapshots = await prisma.analysisCvSnapshot.findMany({
    where: { userId: null },
    select: { id: true, textStorageKey: true },
  });

  for (const snapshot of snapshots) {
    counters.snapshotsGuestProcessed += 1;

    const text = await loadSnapshotText(storage, snapshot.textStorageKey);
    if (!text) {
      counters.snapshotsSkippedNoText += 1;
      continue;
    }

    const extracted = extractContactSignalsFromText(text);
    const signals = buildExtractedSignals(snapshot.id, extracted);
    if (signals.length === 0) continue;

    const outcome = await resolver.resolveForGuest(signals);
    counters.signalsAttached += outcome.attachedSignals;
    counters.conflictsDetected += outcome.conflicts;

    if (outcome.createdProfile) {
      counters.guestProfilesCreated += 1;
      const hasStrong = signals.some((s) => s.signalType !== "NAME_COMPOSITE");
      if (hasStrong) counters.guestProfilesStrongMatch += 1;
      else counters.guestProfilesUnverified += 1;

      await seedProfileCache(prisma, outcome.talentProfileId, {
        fullName: extracted.fullName,
        primaryEmail: normalizeEmail(extracted.email),
        phone: normalizePhone(extracted.phone),
        linkedinUrl: extracted.linkedinUrl,
      });
    } else {
      counters.guestProfilesAttachedToExisting += 1;
    }
  }
}

async function main() {
  const prisma = new PrismaClient();
  const storage = new StorageService();
  const resolver = new TalentIdentityResolver(prisma, DRY_RUN);
  const counters = emptyCounters();

  console.log(
    `[talent-backfill] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"}`,
  );

  try {
    console.log("[talent-backfill] fase A — usuários cadastrados");
    await processUsers(prisma, resolver, counters);

    console.log("[talent-backfill] fase B — snapshots ligados a usuário");
    await processLinkedSnapshots(prisma, storage, resolver, counters);

    console.log("[talent-backfill] fase C — snapshots de guest (anônimos)");
    await processGuestSnapshots(prisma, storage, resolver, counters);

    console.log("[talent-backfill] concluído:");
    console.table(counters);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[talent-backfill] fatal error", error);
  process.exitCode = 1;
});
