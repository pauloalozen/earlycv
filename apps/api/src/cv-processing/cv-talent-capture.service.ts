// Captura da Base de Talentos a partir de um CvStructuredProfile READY —
// plano, seção 2: "toda extração que chega a READY alimenta a Base de
// Talentos", sempre, independente de virar Master. Diferente do capturador
// legado (TalentProfileCaptureService, que opera sobre AnalysisCvSnapshot e
// as tabelas de fato consolidado TalentCompetency/TalentEducation/...),
// este serviço opera sobre o novo schema da Fase 1: TalentSubject (guest) /
// User, TalentProfile (userId XOR talentSubjectId — CHECK
// talent_profile_owner_xor + talent_profile_requires_owner),
// TalentProfileSource (relação com TODAS as fontes) e as observações com
// fingerprint determinístico (seção 8): TalentEducationObservation,
// TalentCompetencyObservation, TalentLanguageObservation,
// TalentCertificationObservation.
//
// Reaproveita o mesmo TalentProfile físico do usuário (userId único, já
// usado pelo capturador legado) quando o dono é autenticado — não cria um
// perfil paralelo. Para guest, opera sobre o TalentProfile do
// TalentSubject (não existe hoje sessão->TalentSubject automática fora
// desta Fase 2; ver cv-processing.worker.ts para como o cvSourceId chega
// aqui já resolvido para um dono).
import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type { TalentCompetencyCategory, TalentProfile } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { CanonicalProfileForSync } from "./cv-user-profile-sync.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export type CaptureOwnerRef =
  | { ownerType: "USER"; userId: string; talentSubjectId?: undefined }
  | { ownerType: "GUEST"; talentSubjectId: string; userId?: undefined };

export type CaptureTalentInput = {
  owner: CaptureOwnerRef;
  cvSourceId: string;
  cvStructuredProfileId: string;
  canonicalProfile: CanonicalProfileForSync;
};

const EMPTY_PLACEHOLDER = "∅"; // "∅" — nunca NULL na chave (plano, seção 8).

function normalizeFingerprintPart(value: string | null | undefined): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return EMPTY_PLACEHOLDER;
  }
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function fingerprint(parts: Array<string | null | undefined>): string {
  const normalized = parts.map(normalizeFingerprintPart).join("|");
  return createHash("sha256").update(normalized).digest("hex");
}

@Injectable()
export class CvTalentCaptureService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // Passo fixo do worker (plano, seção 1.1 item 3 / seção 2): sempre roda
  // pra todo CvStructuredProfile READY, Master ou não. Idempotente — pode
  // ser chamado de novo pro mesmo (talentProfileId, cvStructuredProfileId)
  // sem duplicar (TalentProfileSource é @@unique, observações são
  // @@unique por fingerprint+itemIndex).
  async capture(
    input: CaptureTalentInput,
  ): Promise<{ talentProfileId: string }> {
    const talentProfile = await this.findOrCreateTalentProfile(input.owner);

    await this.database.talentProfileSource.upsert({
      where: {
        talentProfileId_cvSourceId: {
          talentProfileId: talentProfile.id,
          cvSourceId: input.cvSourceId,
        },
      },
      create: {
        talentProfileId: talentProfile.id,
        cvSourceId: input.cvSourceId,
      },
      update: {},
    });

    await this.captureEducation(talentProfile.id, input);
    await this.captureCompetencies(talentProfile.id, input);
    await this.captureLanguages(talentProfile.id, input);
    await this.captureCertifications(talentProfile.id, input);

    return { talentProfileId: talentProfile.id };
  }

  // create() + catch P2002 (não find-then-create, nem upsert puro): dois
  // CvProcessingJob do MESMO usuário processados por workers de fato
  // concorrentes (Fase 2C expõe esse caminho pela primeira vez — antes só
  // um CvProcessingJob por vez batia aqui) podiam ambos observar "não
  // existe" e colidir no @@unique([userId]) do segundo create(). Mesmo
  // padrão já usado em cv-processing-entrypoint.service.ts#createSourceOrReuse
  // e no INSERT de CvMasterDesignation (cv-master-promotion.service.ts):
  // tenta criar, se perder a corrida (violação de unicidade) relê a linha
  // vencedora — nunca lança pro chamador, nunca duplica.
  private async findOrCreateTalentProfile(
    owner: CaptureOwnerRef,
  ): Promise<TalentProfile> {
    if (owner.ownerType === "USER") {
      try {
        return await this.database.talentProfile.create({
          data: { userId: owner.userId },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        return this.database.talentProfile.findUniqueOrThrow({
          where: { userId: owner.userId },
        });
      }
    }

    try {
      return await this.database.talentProfile.create({
        data: { talentSubjectId: owner.talentSubjectId },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      return this.database.talentProfile.findUniqueOrThrow({
        where: { talentSubjectId: owner.talentSubjectId },
      });
    }
  }

  private async captureEducation(
    talentProfileId: string,
    input: CaptureTalentInput,
  ): Promise<void> {
    const items = input.canonicalProfile.education ?? [];
    for (const [itemIndex, item] of items.entries()) {
      const itemFingerprint = fingerprint([
        item.institution,
        item.degree,
        item.fieldOfStudy,
        `${item.startDate ?? ""}-${item.endDate ?? ""}`,
      ]);

      await this.database.talentEducationObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId,
            cvStructuredProfileId: input.cvStructuredProfileId,
            itemFingerprint,
            itemIndex,
          },
        },
        create: {
          talentProfileId,
          cvStructuredProfileId: input.cvStructuredProfileId,
          itemFingerprint,
          itemIndex,
          institutionRaw: item.institution ?? "",
          degreeRaw: item.degree ?? null,
          fieldOfStudyRaw: item.fieldOfStudy ?? null,
          periodRaw:
            item.startDate || item.endDate
              ? `${item.startDate ?? ""} - ${item.endDate ?? ""}`
              : null,
        },
        update: {},
      });
    }
  }

  private async captureCompetencies(
    talentProfileId: string,
    input: CaptureTalentInput,
  ): Promise<void> {
    const skills = input.canonicalProfile.skills ?? [];
    for (const [itemIndex, skill] of skills.entries()) {
      const itemFingerprint = fingerprint(["TECHNICAL_SKILL", skill]);
      await this.database.talentCompetencyObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId,
            cvStructuredProfileId: input.cvStructuredProfileId,
            itemFingerprint,
            itemIndex,
          },
        },
        create: {
          talentProfileId,
          cvStructuredProfileId: input.cvStructuredProfileId,
          category: "TECHNICAL_SKILL" as TalentCompetencyCategory,
          itemFingerprint,
          itemIndex,
          valueRaw: skill,
        },
        update: {},
      });
    }
  }

  private async captureLanguages(
    talentProfileId: string,
    input: CaptureTalentInput,
  ): Promise<void> {
    const languages = input.canonicalProfile.languages ?? [];
    for (const [itemIndex, language] of languages.entries()) {
      const itemFingerprint = fingerprint([language.language, language.level]);
      await this.database.talentLanguageObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId,
            cvStructuredProfileId: input.cvStructuredProfileId,
            itemFingerprint,
            itemIndex,
          },
        },
        create: {
          talentProfileId,
          cvStructuredProfileId: input.cvStructuredProfileId,
          itemFingerprint,
          itemIndex,
          languageRaw: language.language,
          proficiencyLevelRaw: language.level ?? null,
        },
        update: {},
      });
    }
  }

  private async captureCertifications(
    talentProfileId: string,
    input: CaptureTalentInput,
  ): Promise<void> {
    const certifications = input.canonicalProfile.certifications ?? [];
    for (const [itemIndex, certification] of certifications.entries()) {
      const itemFingerprint = fingerprint([
        certification.name,
        certification.issuer,
        certification.year,
      ]);
      await this.database.talentCertificationObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId,
            cvStructuredProfileId: input.cvStructuredProfileId,
            itemFingerprint,
            itemIndex,
          },
        },
        create: {
          talentProfileId,
          cvStructuredProfileId: input.cvStructuredProfileId,
          itemFingerprint,
          itemIndex,
          nameRaw: certification.name,
          issuerRaw: certification.issuer ?? null,
          yearRaw: certification.year ? Number(certification.year) : null,
        },
        update: {},
      });
    }
  }
}
