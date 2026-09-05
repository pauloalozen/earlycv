// Captura contínua da Base de Talentos (ver AGENTS.md "v3.2") — substitui
// os backfills manuais daqui pra frente. Disparado fire-and-forget logo
// após cada AnalysisCvSnapshot (guest ou autenticado): NUNCA deve afetar o
// fluxo de análise do usuário — qualquer erro aqui fica só em log.
//
// Regra de prioridade de enriquecimento (combinada com Paulo em 2026-08-20):
//   - análise de CV master sempre prevalece — roda e sobrescreve o cache,
//     mesmo se já havia um enriquecimento anterior.
//   - análise avulsa (upload solto, guest) só enriquece enquanto o profile
//     ainda não tiver um enriquecimento vindo de CV master; se já tiver,
//     é ignorada (não paga IA, não sobrescreve dado mais confiável).
//   - guest sempre passa pela mesma resolução de identidade do backfill
//     (TalentIdentityResolver — sinal forte concordante anexa/promove,
//     conflitante nunca funde).
//
// Resolução de identidade (regex, sem IA) sempre roda, mesmo quando o
// enriquecimento por IA é pulado — é o que mantém TalentIdentitySignal em
// dia pra toda análise nova, guest ou não.

import { Inject, Injectable, Logger } from "@nestjs/common";
import type { AnalysisCvSourceType } from "@prisma/client";
import type OpenAI from "openai";

import {
  createAiClientFromEnv,
  getActiveAiSupplier,
  getAiModel,
} from "../common/ai-client-factory";
import { DatabaseService } from "../database/database.service";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import { protectConfirmedCacheFields } from "./talent-cache-protection";
import {
  type CanonicalProfile,
  mapCertifications,
  mapCompetencies,
  mapEducation,
  mapExperiences,
  mapLanguages,
  mapProfileCache,
} from "./talent-canonical-mapper";
import {
  extractContactSignalsFromText,
  normalizeEmail,
  normalizeLinkedinHandle,
  normalizePhone,
} from "./talent-identity.util";
import {
  type CandidateSignal,
  TalentIdentityResolver,
} from "./talent-identity-resolver";

const OPERATION = "TALENT_ENRICHMENT";

export type SnapshotCaptureInput = {
  snapshotId: string;
  userId: string | null;
  sourceType: AnalysisCvSourceType;
  text: string;
  // Só relevante pro caminho guest (userId null) — sinal de LOCALIZAÇÃO de
  // sessão (plano, seção 3), nunca a identidade em si. Pode ser null (ex.:
  // caminho de texto colado sem cookie de sessão) — ver
  // TalentSubjectService#resolveOrCreateAnonymousSubject, que garante um
  // TalentSubject mesmo sem ele.
  guestSessionHash?: string | null;
};

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
  snapshotId: string,
  extracted: ReturnType<typeof extractContactSignalsFromText>,
): CandidateSignal[] {
  const signals: CandidateSignal[] = [];
  const base = {
    confidence: "STRONG_MATCH" as const,
    provenance: "EXTRACTED_REGEX" as const,
    sourceRecordType: "AnalysisCvSnapshot",
    sourceRecordId: snapshotId,
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

export function isMasterSourceType(sourceType: AnalysisCvSourceType): boolean {
  return sourceType === "master_resume";
}

// Regra combinada com Paulo em 2026-08-20: CV master sempre prevalece — uma
// análise avulsa nunca sobrescreve um enriquecimento que já veio do master.
// Também nunca reprocessa o mesmo snapshot duas vezes (ex: retry de rede).
export function shouldSkipEnrichment(
  profile: {
    lastEnrichedSourceType: string | null;
    lastEnrichedSourceId: string | null;
  },
  input: { sourceType: AnalysisCvSourceType; snapshotId: string },
): boolean {
  if (profile.lastEnrichedSourceId === input.snapshotId) return true;
  if (
    !isMasterSourceType(input.sourceType) &&
    profile.lastEnrichedSourceType === "master"
  ) {
    return true;
  }
  return false;
}

@Injectable()
export class TalentProfileCaptureService {
  private readonly logger = new Logger(TalentProfileCaptureService.name);
  private readonly aiClient: OpenAI;
  private readonly aiModel: string;

  constructor(
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(TalentSubjectService)
    private readonly talentSubjectService: TalentSubjectService,
  ) {
    this.aiClient = createAiClientFromEnv(OPERATION);
    this.aiModel = getAiModel(OPERATION);
  }

  // Fire-and-forget: NUNCA aguardado pelo chamador, e qualquer falha fica
  // só em log — a captura de talent profile não pode derrubar nem atrasar
  // a resposta de uma análise de CV de verdade.
  //
  // IMPORTANTE (correção Fase 2F-corretiva): este caminho é best-effort por
  // natureza (sem retry, sem persistência de estado de tentativa) — a
  // garantia FORMAL de "nenhuma análise de CV é perdida" é responsabilidade
  // exclusiva do pipeline novo (CvProcessingJob/CvProcessingWorker, plano
  // seção 1). Esta correção só faz esse caminho legado parar de VIOLAR a
  // invariante de dono do TalentProfile — não lhe dá as garantias de
  // retry/recuperação do pipeline novo.
  captureFromSnapshot(input: SnapshotCaptureInput): void {
    void this.run(input).catch((error) => {
      const isOwnerConstraintViolation =
        error instanceof Error &&
        error.message.includes("talent_profile_requires_owner");
      // Nunca engole silenciosamente uma violação da invariante de dono —
      // isso precisa ficar visível mesmo que o resto da captura seja
      // best-effort. `event` é o campo grepável (não há um mecanismo de
      // métrica/counter dedicado pra eventos assíncronos deste tipo no
      // projeto hoje — log estruturado é a opção aceita, ver relatório da
      // Fase 2F-corretiva).
      this.logger.error(
        `falha ao capturar talent profile do snapshot ${input.snapshotId}: ${
          error instanceof Error ? error.message : String(error)
        } ${JSON.stringify({
          event: "talent_profile_capture_failed",
          snapshotId: input.snapshotId,
          userId: input.userId,
          sourceType: input.sourceType,
          ownerConstraintViolation: isOwnerConstraintViolation,
        })}`,
      );
    });
  }

  private async run(input: SnapshotCaptureInput): Promise<void> {
    const extracted = extractContactSignalsFromText(input.text);
    const extractedSignals = buildExtractedSignals(input.snapshotId, extracted);

    const resolver = new TalentIdentityResolver(this.database, false);
    let talentProfileId: string;

    if (input.userId) {
      const account = await this.database.user.findUnique({
        where: { id: input.userId },
        select: {
          email: true,
          profile: {
            select: { contactEmail: true, phone: true, linkedinUrl: true },
          },
        },
      });
      if (!account) return; // usuário apagado entre a análise e este job

      const accountSignals = buildAccountSignals(
        input.userId,
        account.email,
        account.profile,
      );
      const outcome = await resolver.resolveForUser(input.userId, [
        ...accountSignals,
        ...extractedSignals,
      ]);
      talentProfileId = outcome.talentProfileId;

      if (outcome.createdProfile || outcome.promotedToUser) {
        await this.seedProfileCache(talentProfileId, {
          fullName: extracted.fullName ?? null,
          primaryEmail: normalizeEmail(account.email),
          phone: normalizePhone(account.profile?.phone),
          linkedinUrl: account.profile?.linkedinUrl ?? null,
        });
      }
    } else {
      // Correção do bug real (Fase 2F-corretiva): antes desta correção, um
      // guest sem NENHUM sinal extraído fazia este método retornar sem
      // criar nada (perda silenciosa de dado — nem constraint violada, nem
      // captura acontecia); e um guest com só NAME_COMPOSITE (sem sinal
      // FORTE) chegava a criar um TalentProfile sem talentSubjectId,
      // violando talent_profile_requires_owner. Toda análise de visitante
      // agora sempre resolve/cria um TalentSubject primeiro (plano, seção
      // 2: "toda análise alimenta a Base de Talentos") — com ou sem sinal
      // extraído, com ou sem guestSessionHash disponível.
      const { talentSubjectId } =
        await this.talentSubjectService.resolveOrCreateAnonymousSubject(
          input.guestSessionHash ?? null,
        );

      const outcome = await resolver.resolveForGuest(
        extractedSignals,
        talentSubjectId,
      );
      talentProfileId = outcome.talentProfileId;

      if (outcome.requiresLegacyAdoption) {
        // Perfil legado (pré-migration 20260904222812) sem NENHUM dono,
        // encontrado por match de sinal forte — adota a MESMA linha
        // (preserva id/fatos já vinculados) e grava a auditoria. Reusa o
        // talentSubjectId já resolvido acima (nunca cria um segundo
        // TalentSubject candidato à toa). Idempotente por construção
        // (guarded WHERE + no-op se outra chamada concorrente já adotou).
        await this.talentSubjectService.adoptLegacyOwnerlessProfile({
          talentProfileId,
          talentSubjectId,
        });
      }

      if (outcome.createdProfile) {
        await this.seedProfileCache(talentProfileId, {
          fullName: extracted.fullName ?? null,
          primaryEmail: normalizeEmail(extracted.email),
          phone: normalizePhone(extracted.phone),
          linkedinUrl: extracted.linkedinUrl ?? null,
        });
      }
    }

    await this.maybeEnrich(talentProfileId, input);
  }

  private async seedProfileCache(
    talentProfileId: string,
    data: {
      fullName: string | null;
      primaryEmail: string | null;
      phone: string | null;
      linkedinUrl: string | null;
    },
  ): Promise<void> {
    const profile = await this.database.talentProfile.findUnique({
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

    await this.database.talentProfile.update({
      where: { id: talentProfileId },
      data: patch,
    });
  }

  private async maybeEnrich(
    talentProfileId: string,
    input: SnapshotCaptureInput,
  ): Promise<void> {
    const profile = await this.database.talentProfile.findUnique({
      where: { id: talentProfileId },
      select: { lastEnrichedSourceType: true, lastEnrichedSourceId: true },
    });
    if (!profile) return;
    if (shouldSkipEnrichment(profile, input)) return;

    const isMasterSource = isMasterSourceType(input.sourceType);
    let canonical: CanonicalProfile;
    try {
      const { extractMasterCvCanonicalProfile } = await import("@earlycv/ai");
      const { output } = await extractMasterCvCanonicalProfile(
        this.aiClient as never,
        this.aiModel,
        { masterCvText: input.text },
        getActiveAiSupplier(OPERATION),
      );
      canonical = output.canonicalProfile;
    } catch (error) {
      this.logger.warn(
        `falha na extração IA pro talent profile ${talentProfileId} (snapshot ${input.snapshotId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }

    await this.applyCanonicalProfile(talentProfileId, input, canonical, {
      sourceType: isMasterSource ? "master" : "avulso",
    });
  }

  private async applyCanonicalProfile(
    talentProfileId: string,
    input: SnapshotCaptureInput,
    canonical: CanonicalProfile,
    enrichment: { sourceType: "master" | "avulso" },
  ): Promise<void> {
    const provenanceBase = {
      provenance: "EXTRACTED_IA" as const,
      sourceRecordType: "AnalysisCvSnapshot",
      sourceRecordId: input.snapshotId,
    };

    for (const competency of mapCompetencies(canonical)) {
      await this.database.talentCompetency.upsert({
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
      await this.database.talentLanguageSkill.upsert({
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
      await this.database.talentCertification.upsert({
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
      await this.database.talentExperience.upsert({
        where: {
          talentProfileId_sourceRecordType_sourceRecordId_companyNormalized_roleNormalized:
            {
              talentProfileId,
              sourceRecordType: provenanceBase.sourceRecordType,
              sourceRecordId: provenanceBase.sourceRecordId,
              companyNormalized: experience.companyNormalized,
              roleNormalized: experience.roleNormalized,
            },
        },
        create: { talentProfileId, ...experience, ...provenanceBase },
        update: { ...experience, ...provenanceBase },
      });
    }

    for (const education of mapEducation(canonical)) {
      await this.database.talentEducation.upsert({
        where: {
          talentProfileId_sourceRecordType_sourceRecordId: {
            talentProfileId,
            sourceRecordType: provenanceBase.sourceRecordType,
            sourceRecordId: provenanceBase.sourceRecordId,
          },
        },
        create: { talentProfileId, ...education, ...provenanceBase },
        update: { ...education, ...provenanceBase },
      });
    }

    const cachePatch = await protectConfirmedCacheFields(
      this.database,
      talentProfileId,
      mapProfileCache(canonical),
    );
    await this.database.talentProfile.update({
      where: { id: talentProfileId },
      data: {
        ...cachePatch,
        lastEnrichedAt: new Date(),
        lastAnalysisAt: new Date(),
        lastEnrichedSourceType: enrichment.sourceType,
        lastEnrichedSourceId: input.snapshotId,
      },
    });
  }
}
