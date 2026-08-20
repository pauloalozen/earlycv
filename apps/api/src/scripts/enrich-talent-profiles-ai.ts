// Enriquecimento por IA da Base de Talentos — fase 2 (ver AGENTS.md "v3.2").
//
// Pra cada TalentProfile já existente (criado pela fase 1 — rode
// `talent:backfill-profiles -- --apply` antes), acha o melhor texto de CV
// disponível (Resume master do usuário, ou o AnalysisCvSnapshot que gerou o
// profile), roda a MESMA extração canônica já usada pelo CV master
// (packages/ai/master-cv-canonical-extraction) e popula
// competências/idiomas/certificações/experiências/formação.
//
// Dedup por hash de conteúdo: dois profiles com o mesmo texto de CV (ex: CV
// idêntico enviado duas vezes) só pagam UMA chamada de IA dentro da MESMA
// execução — ver estimativa de custo no diagnóstico da sprint (~US$5-15
// pros ~1.4k CVs únicos).
//
// Só considera profiles com lastEnrichedAt nulo (nunca tentado) — sem isso,
// rodar --limit em lotes crescentes (100, depois 300...) reprocessa e paga
// de novo pelos profiles já enriquecidos em lotes anteriores (achado no
// piloto de produção). Passe --force pra reprocessar mesmo assim.
//
// Por padrão roda em --dry-run. Passe --apply pra gravar de verdade, e
// --limit N pra processar só os N primeiros profiles ainda não enriquecidos
// (smoke test barato antes de rodar a base inteira).
//
//   npm run talent:enrich-ai --workspace @earlycv/api -- --limit 5
//   npm run talent:enrich-ai --workspace @earlycv/api -- --apply
//   npm run talent:enrich-ai --workspace @earlycv/api -- --apply --force

import { createHash } from "node:crypto";

import { PrismaClient } from "@prisma/client";

import {
  createAiClientFromEnv,
  getActiveAiSupplier,
  getAiModel,
} from "../common/ai-client-factory";
import { StorageService } from "../storage/storage.service";
import {
  type CanonicalProfile,
  mapCertifications,
  mapCompetencies,
  mapEducation,
  mapExperiences,
  mapLanguages,
  mapProfileCache,
} from "../talent-profiles/talent-canonical-mapper";

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY;
const FORCE = process.argv.includes("--force");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const LIMIT = LIMIT_ARG
  ? Number.parseInt(LIMIT_ARG.split("=")[1], 10)
  : undefined;
const OPERATION = "TALENT_ENRICHMENT";

type EnrichmentSource = {
  talentProfileId: string;
  text: string;
  sourceRecordType: "Resume" | "AnalysisCvSnapshot";
  sourceRecordId: string;
};

type Counters = {
  profilesConsidered: number;
  profilesWithSource: number;
  profilesSkippedNoSource: number;
  uniqueTextsSentToAi: number;
  aiCallsFailed: number;
  competenciesUpserted: number;
  languagesUpserted: number;
  certificationsUpserted: number;
  experiencesUpserted: number;
  educationUpserted: number;
  promptTokens: number;
  completionTokens: number;
};

function emptyCounters(): Counters {
  return {
    profilesConsidered: 0,
    profilesWithSource: 0,
    profilesSkippedNoSource: 0,
    uniqueTextsSentToAi: 0,
    aiCallsFailed: 0,
    competenciesUpserted: 0,
    languagesUpserted: 0,
    certificationsUpserted: 0,
    experiencesUpserted: 0,
    educationUpserted: 0,
    promptTokens: 0,
    completionTokens: 0,
  };
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
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

async function loadSnapshotSource(
  prisma: PrismaClient,
  storage: StorageService,
  talentProfileId: string,
  snapshotId: string,
): Promise<EnrichmentSource | null> {
  const snapshot = await prisma.analysisCvSnapshot.findUnique({
    where: { id: snapshotId },
    select: { id: true, textStorageKey: true },
  });
  if (!snapshot) return null;

  const text = await loadSnapshotText(storage, snapshot.textStorageKey);
  if (!text) return null;

  return {
    talentProfileId,
    text,
    sourceRecordType: "AnalysisCvSnapshot",
    sourceRecordId: snapshot.id,
  };
}

// Prioriza o Resume master de quem tem conta (texto mais confiável/atual).
// Sem master, cai pro snapshot da análise mais recente que virou Kit de
// Candidatura (CvAdaptation.analysisCvSnapshotId) — achado revisando a
// cobertura: 144 dos 179 usuários sem CV master tinham exatamente esse
// caminho disponível e o script não olhava pra ele. Depois cai pro
// TalentIdentitySignal (caso guest); e só por último pro
// originSourceRecordId gravado na criação do profile — cobre o caso em que
// o próprio sinal de identidade nunca existiu (ex: o único texto extraído
// do CV foi um cabeçalho de seção genérico como "Contato", que colidiu com
// outro profile e nunca virou TalentIdentitySignal).
async function resolveSource(
  prisma: PrismaClient,
  storage: StorageService,
  profile: {
    id: string;
    userId: string | null;
    originSourceRecordType: string | null;
    originSourceRecordId: string | null;
  },
): Promise<EnrichmentSource | null> {
  if (profile.userId) {
    const resume = await prisma.resume.findFirst({
      where: { userId: profile.userId, isMaster: true, rawText: { not: null } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, rawText: true },
    });
    if (resume?.rawText) {
      return {
        talentProfileId: profile.id,
        text: resume.rawText,
        sourceRecordType: "Resume",
        sourceRecordId: resume.id,
      };
    }

    const adaptation = await prisma.cvAdaptation.findFirst({
      where: { userId: profile.userId, analysisCvSnapshotId: { not: null } },
      orderBy: { createdAt: "desc" },
      select: { analysisCvSnapshotId: true },
    });
    if (adaptation?.analysisCvSnapshotId) {
      const source = await loadSnapshotSource(
        prisma,
        storage,
        profile.id,
        adaptation.analysisCvSnapshotId,
      );
      if (source) return source;
    }
  }

  const signal = await prisma.talentIdentitySignal.findFirst({
    where: {
      talentProfileId: profile.id,
      sourceRecordType: "AnalysisCvSnapshot",
    },
    orderBy: { createdAt: "desc" },
    select: { sourceRecordId: true },
  });
  if (signal) {
    const source = await loadSnapshotSource(
      prisma,
      storage,
      profile.id,
      signal.sourceRecordId,
    );
    if (source) return source;
  }

  if (
    profile.originSourceRecordType === "AnalysisCvSnapshot" &&
    profile.originSourceRecordId
  ) {
    return loadSnapshotSource(
      prisma,
      storage,
      profile.id,
      profile.originSourceRecordId,
    );
  }

  return null;
}

async function applyCanonicalProfile(
  prisma: PrismaClient,
  source: EnrichmentSource,
  canonical: CanonicalProfile,
  counters: Counters,
) {
  const talentProfileId = source.talentProfileId;
  const provenanceBase = {
    provenance: "EXTRACTED_IA" as const,
    sourceRecordType: source.sourceRecordType,
    sourceRecordId: source.sourceRecordId,
  };

  for (const competency of mapCompetencies(canonical)) {
    counters.competenciesUpserted += 1;
    if (DRY_RUN) continue;
    await prisma.talentCompetency.upsert({
      where: {
        talentProfileId_category_valueNormalized: {
          talentProfileId,
          category: competency.category,
          valueNormalized: competency.valueNormalized,
        },
      },
      create: { talentProfileId, ...competency, ...provenanceBase },
      update: { lastObservedAt: new Date(), ...provenanceBase },
    });
  }

  for (const language of mapLanguages(canonical)) {
    counters.languagesUpserted += 1;
    if (DRY_RUN) continue;
    await prisma.talentLanguageSkill.upsert({
      where: {
        talentProfileId_language: {
          talentProfileId,
          language: language.language,
        },
      },
      create: { talentProfileId, ...language, ...provenanceBase },
      update: {
        proficiencyLevel: language.proficiencyLevel,
        ...provenanceBase,
      },
    });
  }

  for (const certification of mapCertifications(canonical)) {
    counters.certificationsUpserted += 1;
    if (DRY_RUN) continue;
    await prisma.talentCertification.upsert({
      where: {
        talentProfileId_nameNormalized: {
          talentProfileId,
          nameNormalized: certification.nameNormalized,
        },
      },
      create: { talentProfileId, ...certification, ...provenanceBase },
      update: { ...provenanceBase },
    });
  }

  for (const experience of mapExperiences(canonical)) {
    counters.experiencesUpserted += 1;
    if (DRY_RUN) continue;
    await prisma.talentExperience.upsert({
      where: {
        talentProfileId_sourceRecordType_sourceRecordId_companyNormalized_roleNormalized:
          {
            talentProfileId,
            sourceRecordType: source.sourceRecordType,
            sourceRecordId: source.sourceRecordId,
            companyNormalized: experience.companyNormalized,
            roleNormalized: experience.roleNormalized,
          },
      },
      create: { talentProfileId, ...experience, ...provenanceBase },
      update: { ...experience, ...provenanceBase },
    });
  }

  for (const education of mapEducation(canonical)) {
    counters.educationUpserted += 1;
    if (DRY_RUN) continue;
    await prisma.talentEducation.upsert({
      where: {
        talentProfileId_sourceRecordType_sourceRecordId: {
          talentProfileId,
          sourceRecordType: source.sourceRecordType,
          sourceRecordId: source.sourceRecordId,
        },
      },
      create: { talentProfileId, ...education, ...provenanceBase },
      update: { ...education, ...provenanceBase },
    });
  }

  // Marca lastEnrichedAt mesmo quando a IA não achou nada pra cachear —
  // é o que impede o profile de ser reprocessado (e recobrado) numa
  // próxima rodada só porque o CV é pouco informativo.
  const cachePatch = mapProfileCache(canonical);
  if (!DRY_RUN) {
    await prisma.talentProfile.update({
      where: { id: talentProfileId },
      data: { ...cachePatch, lastEnrichedAt: new Date() },
    });
  }
}

async function main() {
  const prisma = new PrismaClient();
  const storage = new StorageService();
  const aiClient = createAiClientFromEnv(OPERATION);
  const model = getAiModel(OPERATION);
  const counters = emptyCounters();
  const cache = new Map<string, CanonicalProfile>();

  console.log(
    `[talent-enrich] modo: ${DRY_RUN ? "DRY-RUN (nada será gravado)" : "APPLY (gravando de verdade)"} | modelo: ${model}${LIMIT ? ` | limite: ${LIMIT}` : ""}`,
  );

  try {
    const profiles = await prisma.talentProfile.findMany({
      where: FORCE ? undefined : { lastEnrichedAt: null },
      select: {
        id: true,
        userId: true,
        originSourceRecordType: true,
        originSourceRecordId: true,
      },
      ...(LIMIT ? { take: LIMIT } : {}),
      orderBy: { createdAt: "asc" },
    });

    for (const profile of profiles) {
      counters.profilesConsidered += 1;
      const source = await resolveSource(prisma, storage, profile);
      if (!source) {
        counters.profilesSkippedNoSource += 1;
        continue;
      }
      counters.profilesWithSource += 1;

      const hash = hashText(source.text);
      let canonical = cache.get(hash);
      if (!canonical) {
        try {
          const { extractMasterCvCanonicalProfile } = await import(
            "@earlycv/ai"
          );
          const { output, audit } = await extractMasterCvCanonicalProfile(
            aiClient as never,
            model,
            { masterCvText: source.text },
            getActiveAiSupplier(OPERATION),
          );
          canonical = output.canonicalProfile;
          cache.set(hash, canonical);
          counters.uniqueTextsSentToAi += 1;
          counters.promptTokens += audit.result.usage?.promptTokens ?? 0;
          counters.completionTokens +=
            audit.result.usage?.completionTokens ?? 0;
        } catch (error) {
          counters.aiCallsFailed += 1;
          console.warn(
            `[talent-enrich] falha na extração pra profile ${profile.id}: ${error instanceof Error ? error.message : "erro desconhecido"}`,
          );
          continue;
        }
      }

      await applyCanonicalProfile(prisma, source, canonical, counters);
    }

    console.log("[talent-enrich] concluído:");
    console.table(counters);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("[talent-enrich] fatal error", error);
  process.exitCode = 1;
});
