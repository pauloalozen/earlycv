// Sincronização de UserProfile a partir de um CvStructuredProfile READY que
// se tornou Master — plano, seção 1.1 item 4 / seção 4.2 item 6: precisa
// rodar DENTRO da mesma transação Prisma que promove o Master e cria o
// MonitorProjectionJob (nunca depois, nunca fire-and-forget). Por isso todo
// método aqui recebe `tx` (o client transacional) em vez de usar
// DatabaseService diretamente.
//
// Reaproveita a mesma lógica de merge/readiness já usada pelo caminho
// legado (MasterCvCanonicalExtractionService#mergeIntoUserProfile) via os
// serviços puros compartilhados (ProfileCanonicalMergeService,
// ProfileReadinessService — nenhum dos dois toca o banco). Simplificação
// deliberada frente ao legado: a classificação de radar (radarAreas/
// radarSeniority) aqui só é aplicada quando o UserProfile ainda não tem
// nenhuma classificação — nunca sobrescreve uma já existente (o legado tem
// uma lógica mais rica de sugestão/fieldMeta para overwrite; replicá-la por
// completo ficou fora do orçamento desta fase e está registrado como
// pendência no relatório da Fase 2).
import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import { JobArea, type Prisma, SeniorityLevel } from "@prisma/client";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import type {
  CanonicalProfileData,
  ProfileFieldMetaEntry,
  ProfileSuggestion,
} from "../profiles/profile-canonical.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";

// Mesma forma de client aceita por database.$transaction(async (tx) => ...):
// só precisamos de tx.userProfile aqui.
export type UserProfileTxClient = {
  userProfile: {
    findUnique: (args: {
      where: { userId: string };
    }) => Promise<Record<string, unknown> | null>;
    update: (args: {
      where: { userId: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export type CanonicalProfileForSync =
  MasterCvCanonicalExtractionOutput["canonicalProfile"];

@Injectable()
export class CvUserProfileSyncService {
  constructor(
    @Inject(ProfileCanonicalMergeService)
    private readonly profileMergeService: Pick<
      ProfileCanonicalMergeService,
      "merge"
    >,
    @Inject(ProfileReadinessService)
    private readonly profileReadinessService: Pick<
      ProfileReadinessService,
      "compute"
    >,
  ) {}

  async syncWithinTransaction(
    tx: UserProfileTxClient,
    input: {
      userId: string;
      canonicalProfile: CanonicalProfileForSync;
      confidence: Record<string, number>;
      cvSourceId: string;
      extractedAt: string;
    },
  ): Promise<void> {
    const profile = (await tx.userProfile.findUnique({
      where: { userId: input.userId },
    })) as {
      fullName: string | null;
      contactEmail: string | null;
      phone: string | null;
      linkedinUrl: string | null;
      city: string | null;
      state: string | null;
      country: string | null;
      headline: string | null;
      professionalSummary: string | null;
      experiencesJson: unknown;
      educationJson: unknown;
      skillsJson: unknown;
      languagesJson: unknown;
      certificationsJson: unknown;
      profileFieldMetaJson: unknown;
      profileSuggestionsJson: unknown;
      radarAreas: JobArea[];
      radarSeniority: SeniorityLevel | null;
    } | null;

    if (!profile) return; // usuário sem UserProfile ainda (nunca deve acontecer para conta autenticada)

    const merged = this.profileMergeService.merge({
      existing: this.mapProfileRecordToCanonicalData(profile),
      incoming: this.mapCanonicalToData(input.canonicalProfile),
      source: "base_cv_ai_extraction",
      sourceCvId: input.cvSourceId,
      fieldMeta: this.asFieldMetaRecord(profile.profileFieldMetaJson),
      suggestions: this.asSuggestions(profile.profileSuggestionsJson),
      extractionContext: {
        confidence: input.confidence,
        extractedAt: input.extractedAt,
      },
    });

    const readiness = this.profileReadinessService.compute({
      ...merged.next,
      experiences: merged.next.experiences ?? [],
      education: merged.next.education ?? [],
      skills: merged.next.skills ?? { technical: [], business: [], soft: [] },
      languages: merged.next.languages ?? [],
      certifications: merged.next.certifications ?? [],
    });

    const radar = this.sanitizeRadarClassification(
      input.canonicalProfile.radarProfile,
    );
    // Nunca sobrescreve classificação de radar já existente (ver nota no
    // topo do arquivo) — só preenche quando ainda vazio.
    const radarAreas =
      profile.radarAreas.length > 0 ? profile.radarAreas : radar.areas;
    const radarSeniority =
      profile.radarSeniority && profile.radarSeniority !== "UNKNOWN"
        ? profile.radarSeniority
        : radar.seniority;

    await tx.userProfile.update({
      where: { userId: input.userId },
      data: {
        fullName: merged.next.fullName ?? profile.fullName,
        contactEmail: merged.next.contactEmail ?? profile.contactEmail,
        headline: merged.next.headline ?? profile.headline,
        linkedinUrl: merged.next.linkedinUrl ?? profile.linkedinUrl,
        phone: merged.next.phone ?? profile.phone,
        city: merged.next.city ?? profile.city,
        state: merged.next.state ?? profile.state,
        country: merged.next.country ?? profile.country,
        professionalSummary:
          merged.next.professionalSummary ?? profile.professionalSummary,
        radarAreas,
        radarSeniority,
        profileFieldMetaJson: merged.fieldMeta as Prisma.InputJsonValue,
        profileSuggestionsJson: merged.suggestions as Prisma.InputJsonValue,
        profileReadinessStatus: readiness,
        skillsJson: (merged.next.skills ?? {
          technical: [],
          business: [],
          soft: [],
        }) as Prisma.InputJsonValue,
        experiencesJson: (merged.next.experiences ??
          []) as Prisma.InputJsonValue,
        educationJson: (merged.next.education ?? []) as Prisma.InputJsonValue,
        languagesJson: (merged.next.languages ?? []) as Prisma.InputJsonValue,
        certificationsJson: (merged.next.certifications ??
          []) as Prisma.InputJsonValue,
      },
    });
  }

  private sanitizeRadarClassification(
    radarProfile: CanonicalProfileForSync["radarProfile"],
  ): { areas: JobArea[]; seniority: SeniorityLevel } {
    const areas = Array.isArray(radarProfile?.areas)
      ? radarProfile.areas.filter((item): item is JobArea =>
          Object.values(JobArea).includes(item as JobArea),
        )
      : [];
    const seniority = Object.values(SeniorityLevel).includes(
      radarProfile?.seniority as SeniorityLevel,
    )
      ? (radarProfile?.seniority as SeniorityLevel)
      : SeniorityLevel.UNKNOWN;
    return { areas, seniority };
  }

  private mapCanonicalToData(
    canonical: CanonicalProfileForSync,
  ): Partial<CanonicalProfileData> {
    return {
      fullName: canonical.fullName ?? undefined,
      contactEmail: canonical.email ?? undefined,
      headline: canonical.headline ?? undefined,
      phone: canonical.phone ?? undefined,
      linkedinUrl: canonical.linkedinUrl ?? undefined,
      city: canonical.location.city ?? undefined,
      state: canonical.location.state ?? undefined,
      country: canonical.location.country ?? undefined,
      professionalSummary: canonical.professionalSummary ?? undefined,
      experiences: canonical.experiences.map((experience) => ({
        id: this.buildDeterministicId("exp", [
          experience.company,
          experience.role,
          experience.startDate,
          experience.endDate,
          ...(experience.bullets ?? []),
          ...(experience.technologies ?? []),
        ]),
        company: experience.company ?? undefined,
        role: experience.role ?? undefined,
        startDate: experience.startDate ?? undefined,
        endDate: experience.endDate ?? undefined,
        description: experience.bullets.join("\n").trim() || undefined,
        relatedSkills: experience.technologies,
      })),
      education: canonical.education.map((entry) => ({
        id: this.buildDeterministicId("edu", [
          entry.institution,
          entry.degree,
          entry.fieldOfStudy,
          entry.startDate,
          entry.endDate,
        ]),
        institution: entry.institution ?? undefined,
        degree: entry.degree ?? undefined,
        fieldOfStudy: entry.fieldOfStudy ?? undefined,
        startDate: entry.startDate ?? undefined,
        endDate: entry.endDate ?? undefined,
      })),
      skills: {
        technical: canonical.skills,
        business: [],
        soft: [],
      },
      languages: canonical.languages.map((lang) => ({
        language: lang.language,
        level: lang.level ?? undefined,
      })),
      certifications: canonical.certifications.map((cert) => ({
        name: cert.name,
        issuer: cert.issuer ?? undefined,
        year: cert.year ?? undefined,
      })),
    };
  }

  private mapProfileRecordToCanonicalData(profile: {
    fullName: string | null;
    contactEmail: string | null;
    phone: string | null;
    linkedinUrl: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    headline: string | null;
    professionalSummary: string | null;
    experiencesJson: unknown;
    educationJson: unknown;
    skillsJson: unknown;
    languagesJson: unknown;
    certificationsJson: unknown;
  }): CanonicalProfileData {
    const skills = this.asRecord(profile.skillsJson);
    return {
      fullName: profile.fullName ?? undefined,
      contactEmail: profile.contactEmail ?? undefined,
      phone: profile.phone ?? undefined,
      linkedinUrl: profile.linkedinUrl ?? undefined,
      city: profile.city ?? undefined,
      state: profile.state ?? undefined,
      country: profile.country ?? undefined,
      headline: profile.headline ?? undefined,
      professionalSummary: profile.professionalSummary ?? undefined,
      experiences: this.asArray(
        profile.experiencesJson,
      ) as CanonicalProfileData["experiences"],
      education: this.asArray(
        profile.educationJson,
      ) as CanonicalProfileData["education"],
      skills: {
        technical: this.asStringArray(skills.technical),
        business: this.asStringArray(skills.business),
        soft: this.asStringArray(skills.soft),
      },
      languages: this.asArray(
        profile.languagesJson,
      ) as CanonicalProfileData["languages"],
      certifications: this.asArray(
        profile.certificationsJson,
      ) as CanonicalProfileData["certifications"],
    };
  }

  private buildDeterministicId(
    prefix: string,
    values: Array<string | null | undefined>,
  ): string {
    const fingerprint = values
      .map((value) =>
        typeof value === "string"
          ? value.trim().toLowerCase().replace(/\s+/g, " ")
          : "",
      )
      .filter((value) => value.length > 0)
      .join("|");
    const hash = createHash("sha256")
      .update(fingerprint)
      .digest("hex")
      .slice(0, 12);
    return `${prefix}_${hash}`;
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
  }

  private asStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string");
  }

  private asFieldMetaRecord(
    value: unknown,
  ): Record<string, ProfileFieldMetaEntry> {
    const record = this.asRecord(value);
    const parsed: Record<string, ProfileFieldMetaEntry> = {};
    for (const [key, entry] of Object.entries(record)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }
      const source = (entry as { source?: unknown }).source;
      if (
        source !== "analysis_upload" &&
        source !== "base_cv_upload" &&
        source !== "base_cv_ai_extraction" &&
        source !== "manual_edit"
      ) {
        continue;
      }
      parsed[key] = {
        source,
        manuallyEdited:
          typeof (entry as { manuallyEdited?: unknown }).manuallyEdited ===
          "boolean"
            ? (entry as { manuallyEdited: boolean }).manuallyEdited
            : undefined,
        lastEditedAt:
          typeof (entry as { lastEditedAt?: unknown }).lastEditedAt === "string"
            ? (entry as { lastEditedAt: string }).lastEditedAt
            : undefined,
        sourceCvId:
          typeof (entry as { sourceCvId?: unknown }).sourceCvId === "string" ||
          (entry as { sourceCvId?: unknown }).sourceCvId === null
            ? ((entry as { sourceCvId?: string | null }).sourceCvId ?? null)
            : undefined,
        sourceConfidence:
          typeof (entry as { sourceConfidence?: unknown }).sourceConfidence ===
          "number"
            ? (entry as { sourceConfidence: number }).sourceConfidence
            : undefined,
        sourceExtractedAt:
          typeof (entry as { sourceExtractedAt?: unknown })
            .sourceExtractedAt === "string"
            ? (entry as { sourceExtractedAt: string }).sourceExtractedAt
            : undefined,
      };
    }
    return parsed;
  }

  private asSuggestions(value: unknown): ProfileSuggestion[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is ProfileSuggestion => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as {
        createdAt?: unknown;
        fieldPath?: unknown;
        source?: unknown;
        status?: unknown;
      };
      const validSource =
        candidate.source === "analysis_upload" ||
        candidate.source === "base_cv_upload" ||
        candidate.source === "base_cv_ai_extraction" ||
        candidate.source === "manual_edit";
      const validStatus =
        candidate.status === "pending" ||
        candidate.status === "accepted" ||
        candidate.status === "rejected";
      return (
        typeof candidate.fieldPath === "string" &&
        typeof candidate.createdAt === "string" &&
        validSource &&
        validStatus
      );
    });
  }
}
