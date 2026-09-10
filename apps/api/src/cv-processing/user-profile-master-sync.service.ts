// Achado 2026-09-09: edições diretas em UserProfile (blocos do CV Master em
// /meu-cv-master — resumo, experiência, formação, skills, idiomas,
// certificados, contato) nunca alimentavam análises novas nem geração de
// CV — o pipeline canônico só lia do CvStructuredProfile extraído do
// arquivo/texto original no momento do upload, congelado pra sempre. Este
// serviço fecha essa lacuna, mas só pra análises NOVAS: chamado
// exclusivamente por CvAdaptationService#resolveActiveMasterCvProcessingJobId
// (nunca durante geração/liberação de uma CvAdaptation já existente —
// aquelas mantêm seu cvStructuredProfileId congelado, por design/trigger de
// banco: CvStructuredProfile é imutável após READY).
//
// Sem chamada de IA: UserProfile já é estruturado (o próprio usuário edita
// campo a campo), então "sincronizar" é só mapear pro mesmo shape que a
// extração por IA produz (user-profile-canonical-mapper.ts) e reusar a MESMA
// infraestrutura de versionamento já auditada (CvSource dedup por hash,
// CvStructuredProfile append-only/imutável, CvMasterDesignation com
// supersede) — nunca reescreve nada existente, só cria uma versão nova
// quando o conteúdo do UserProfile realmente mudou desde a última
// sincronização.
import { createHash } from "node:crypto";

import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  flattenCanonicalCvProfileToText,
  isCanonicalCvProfileEffectivelyEmpty,
  mapUserProfileToCanonicalCvProfile,
  stableSerializeCanonicalCvProfile,
} from "../profiles/user-profile-canonical-mapper";
import type { ProfileFieldMetaEntry } from "../profiles/profile-canonical.types";
import { buildCvSourceTextStorageKey } from "./cv-processing-entrypoint.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import { StorageService } from "../storage/storage.service";

export const PROFILE_EDIT_EXTRACTOR_VERSION = "user-profile-direct";
export const PROFILE_EDIT_SCHEMA_VERSION = "v1";

@Injectable()
export class UserProfileMasterSyncService {
  private readonly logger = new Logger(UserProfileMasterSyncService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvMasterPromotionService)
    private readonly masterPromotion: CvMasterPromotionService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "putObject">,
  ) {}

  // Garante que o Master formal do usuário reflete o UserProfile atual.
  // Idempotente e barato quando já está em dia (2-3 SELECTs, sem escrita).
  //
  // Achado 2026-09-10 testando manualmente: a versão anterior disparava na
  // PRIMEIRA análise nova depois de qualquer claim/upload, mesmo sem
  // nenhuma edição manual — o Master (arquivo original, com nome de
  // verdade) virava "CV Master (sincronizado do perfil)" só porque o
  // extractorVersion da fonte ativa era diferente do meu marcador, nunca
  // porque o usuário editou algo. Gate correto: só sincroniza quando
  // existe pelo menos um campo com source "manual_edit" em
  // profileFieldMetaJson (profiles.service.ts#update já marca isso a cada
  // PUT /users/profile) — nunca hidrata/promove nada a partir de campos que
  // só vieram de projeção automática da extração por IA.
  async ensureMasterReflectsProfileEdits(userId: string): Promise<void> {
    const profile = await this.database.userProfile.findUnique({
      where: { userId },
    });
    if (!profile) return;
    if (!this.hasManualEdits(profile.profileFieldMetaJson)) return;

    const canonicalProfile = mapUserProfileToCanonicalCvProfile(profile);
    if (isCanonicalCvProfileEffectivelyEmpty(canonicalProfile)) return;

    const serialized = stableSerializeCanonicalCvProfile(canonicalProfile);
    const textSha256 = createHash("sha256").update(serialized).digest("hex");

    const active = await this.masterPromotion.getActiveDesignation({
      ownerType: "USER",
      userId,
    });

    if (active) {
      const activeStructuredProfile =
        await this.database.cvStructuredProfile.findUnique({
          where: { id: active.cvStructuredProfileId },
          select: { cvSourceId: true, extractorVersion: true },
        });
      if (
        activeStructuredProfile?.extractorVersion ===
        PROFILE_EDIT_EXTRACTOR_VERSION
      ) {
        const activeSource = await this.database.cvSource.findUnique({
          where: { id: activeStructuredProfile.cvSourceId },
          select: { textSha256: true },
        });
        if (activeSource?.textSha256 === textSha256) {
          return; // já sincronizado com o UserProfile atual — no-op.
        }
      }
    }

    const textStorageKey = buildCvSourceTextStorageKey(
      "USER",
      userId,
      textSha256,
    );

    const existingSource = await this.database.cvSource.findUnique({
      where: { userId_textSha256: { userId, textSha256 } },
    });

    if (!existingSource) {
      await this.storage.putObject(
        textStorageKey,
        Buffer.from(serialized, "utf-8"),
        "application/json; charset=utf-8",
      );
    }

    const cvSource =
      existingSource ??
      (await this.createSourceOrReuse(userId, textStorageKey, textSha256));

    const structuredProfile = await this.database.cvStructuredProfile.upsert({
      where: {
        cvSourceId_extractorVersion_schemaVersion: {
          cvSourceId: cvSource.id,
          extractorVersion: PROFILE_EDIT_EXTRACTOR_VERSION,
          schemaVersion: PROFILE_EDIT_SCHEMA_VERSION,
        },
      },
      create: {
        cvSourceId: cvSource.id,
        extractorVersion: PROFILE_EDIT_EXTRACTOR_VERSION,
        schemaVersion: PROFILE_EDIT_SCHEMA_VERSION,
        status: "READY",
        canonicalJson: canonicalProfile as unknown as Prisma.InputJsonValue,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
      // Mesmo cvSourceId nunca se repete com conteúdo diferente (hash
      // determina o cvSourceId) — este update só é alcançável se uma
      // tentativa anterior ficou PENDING/FAILED (nunca sobrescreve READY,
      // protegido pela trigger de banco de qualquer forma).
      update: {
        status: "READY",
        canonicalJson: canonicalProfile as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    const cvSubmission = await this.database.cvSubmission.create({
      data: { cvSourceId: cvSource.id, origin: "PROFILE_EDIT" },
    });

    await this.database.cvProcessingJob.create({
      data: {
        cvSourceId: cvSource.id,
        cvSubmissionId: cvSubmission.id,
        masterIntent: "PROMOTE_EXPLICIT",
        status: "READY",
        cvStructuredProfileId: structuredProfile.id,
        finishedAt: new Date(),
      },
    });

    // Achado (migration 20260905160000_cv_master_designation_integrity_defense):
    // toda CvMasterDesignation ATIVA de usuário exige resumeId apontando pra
    // um Resume com isMaster=true — checado no COMMIT (trigger deferred),
    // sem exceção. Reusa (só atualiza cvSourceId/rawText) o MESMO Resume que
    // já é o Master ativo, seja ele de arquivo ou de uma sincronização
    // anterior — NUNCA toca title/sourceFileName: achado 2026-09-10, o
    // usuário perde a rastreabilidade do arquivo original se o nome some.
    // Só cria um Resume novo quando não existe nenhum Master ativo ainda
    // (usuário nunca fez upload nem foi promovido por nenhum caminho).
    const rawText = flattenCanonicalCvProfileToText(canonicalProfile);
    const resumeId = active?.resumeId
      ? await this.database.resume
          .update({
            where: { id: active.resumeId },
            data: { cvSourceId: cvSource.id, rawText },
          })
          .then((r) => r.id)
      : await this.database.resume
          .create({
            data: {
              userId,
              title: "CV Master (sincronizado do perfil)",
              kind: "master",
              status: "uploaded",
              isMaster: false, // flip acontece atomicamente dentro de promote() abaixo
              cvSourceId: cvSource.id,
              rawText,
            },
          })
          .then((r) => r.id);

    try {
      await this.masterPromotion.promote({
        ownerType: "USER",
        userId,
        cvStructuredProfileId: structuredProfile.id,
        resumeId,
        masterIntent: "PROMOTE_EXPLICIT",
        promotedReason: "PROFILE_EDIT_SYNC",
        syncResumeIsMaster: true,
      });
    } catch (error) {
      // Erro de domínio recuperável (mesmo padrão do worker): não deixa a
      // análise em curso quebrar por causa da sincronização — loga e segue
      // com o Master anterior (resolveActiveMasterCvProcessingJobId
      // continua funcionando com a designação ativa que já existia).
      this.logger.warn(
        `Falha ao promover Master sincronizado do UserProfile para ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Mesmo formato de profiles.service.ts#parseFieldMeta — duplicado
  // deliberadamente (função pequena, evita acoplar os dois serviços por um
  // método privado).
  private hasManualEdits(profileFieldMetaJson: unknown): boolean {
    if (
      !profileFieldMetaJson ||
      typeof profileFieldMetaJson !== "object" ||
      Array.isArray(profileFieldMetaJson)
    ) {
      return false;
    }
    return Object.values(
      profileFieldMetaJson as Record<string, ProfileFieldMetaEntry>,
    ).some((entry) => entry?.source === "manual_edit");
  }

  private async createSourceOrReuse(
    userId: string,
    textStorageKey: string,
    textSha256: string,
  ) {
    try {
      return await this.database.cvSource.create({
        data: {
          ownerType: "USER",
          userId,
          textStorageKey,
          textSha256,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return this.database.cvSource.findUniqueOrThrow({
          where: { userId_textSha256: { userId, textSha256 } },
        });
      }
      throw error;
    }
  }
}
