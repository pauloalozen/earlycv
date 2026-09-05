// Ponto único de entrada do caminho NOVO (flag ligada) a partir de um
// upload/texto de CV master — plano, seção 6/12 (Fase 2: "caminho antigo
// continua no lugar, desligado por flag"). Usado pelos entrypoints
// legados (resumes.service.ts#create, cv-adaptation.service.ts
// #triggerMasterCvExtraction) SÓ quando isCvStructuredProfilePipelineEnabled()
// é true — nunca substitui o caminho legado, só roda ao lado dele.
//
// Tudo aqui é awaited pelo chamador ANTES da resposta HTTP (requisito da
// Fase 2, item 5: nenhuma Promise crítica fire-and-forget sobrevivendo à
// resposta) — a extração de IA em si roda depois, só no CvProcessingWorker
// (cron separado), nunca aqui.
import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";
import type {
  CvProcessingMasterIntent,
  CvSubmissionOrigin,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import { CvProcessingJobService } from "./cv-processing-job.service";

// Chave do objeto de texto no storage real (Fase 2B — substitui o base64
// inline da Fase 2A). Mesmo padrão de nomeação já usado por
// resumes.service.ts (`resumes/${userId}/...`): namespace por dono,
// determinístico pelo hash do conteúdo — duas submissões com o mesmo
// textSha256 do mesmo dono resolvem para a MESMA chave, então o segundo
// putObject apenas sobrescreve o objeto existente com bytes idênticos
// (idempotente por construção, nunca duplica objeto no bucket).
export function buildCvSourceTextStorageKey(
  ownerType: "USER" | "GUEST",
  ownerId: string,
  textSha256: string,
): string {
  const namespace = ownerType === "USER" ? "users" : "guests";
  return `cv-processing/${namespace}/${ownerId}/${textSha256}.txt`;
}

type CvProcessingSubmissionInput =
  | {
      origin: "FILE_UPLOAD";
      fileName: string;
      mimeType: string;
      fileSizeBytes: number;
    }
  | { origin: "PASTED_TEXT" };

export type EnqueueCvProcessingInput = {
  userId: string;
  text: string;
  masterIntent: CvProcessingMasterIntent;
  submission: CvProcessingSubmissionInput;
};

// Fase 2D — sibling de EnqueueCvProcessingInput pro dono GUEST
// (talentSubjectId em vez de userId). Ver enqueueFromGuestText.
export type EnqueueCvProcessingGuestInput = {
  talentSubjectId: string;
  text: string;
  masterIntent: CvProcessingMasterIntent;
  submission: CvProcessingSubmissionInput;
};

@Injectable()
export class CvProcessingEntrypointService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvProcessingJobService)
    private readonly jobService: CvProcessingJobService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "putObject">,
  ) {}

  async enqueueFromUserText(input: EnqueueCvProcessingInput) {
    return this.enqueueCommon(
      { ownerType: "USER", userId: input.userId },
      input.text,
      input.masterIntent,
      input.submission,
    );
  }

  // Fase 2D — sibling de enqueueFromUserText pro caminho de visitante
  // (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, escopo
  // "Fase 2D"). talentSubjectId já deve estar resolvido pelo chamador
  // (TalentSubjectService#resolveForGuestSession) — este método nunca
  // resolve/cria TalentSubject sozinho, só usa o dono já decidido. Reusa
  // 100% da lógica de dedup/storage/job de enqueueFromUserText via
  // enqueueCommon — a única diferença real é o tipo de dono.
  async enqueueFromGuestText(input: EnqueueCvProcessingGuestInput) {
    return this.enqueueCommon(
      { ownerType: "GUEST", talentSubjectId: input.talentSubjectId },
      input.text,
      input.masterIntent,
      input.submission,
    );
  }

  private async enqueueCommon(
    owner:
      | { ownerType: "USER"; userId: string }
      | { ownerType: "GUEST"; talentSubjectId: string },
    text: string,
    masterIntent: CvProcessingMasterIntent,
    submission: CvProcessingSubmissionInput,
  ) {
    const textSha256 = createHash("sha256").update(text).digest("hex");
    const ownerId =
      owner.ownerType === "USER" ? owner.userId : owner.talentSubjectId;
    const textStorageKey = buildCvSourceTextStorageKey(
      owner.ownerType,
      ownerId,
      textSha256,
    );

    // Dedup real: se já existe um CvSource com este (dono, textSha256), o
    // objeto já foi gravado por uma submissão anterior — não faz sentido
    // gravar de novo no storage (a chave é determinística pelo hash, então
    // o conteúdo seria idêntico byte a byte). Só escreve no storage quando
    // é conteúdo genuinamente novo para este dono.
    const existingSource =
      owner.ownerType === "USER"
        ? await this.database.cvSource.findUnique({
            where: { userId_textSha256: { userId: owner.userId, textSha256 } },
          })
        : await this.database.cvSource.findUnique({
            where: {
              talentSubjectId_textSha256: {
                talentSubjectId: owner.talentSubjectId,
                textSha256,
              },
            },
          });

    if (!existingSource) {
      await this.storage.putObject(
        textStorageKey,
        Buffer.from(text, "utf-8"),
        "text/plain; charset=utf-8",
      );
    }

    const cvSource =
      existingSource ??
      (await this.createSourceOrReuse(owner, textStorageKey, textSha256));

    const cvSubmission = await this.database.cvSubmission.create({
      data: {
        cvSourceId: cvSource.id,
        origin: submission.origin as CvSubmissionOrigin,
        ...(submission.origin === "FILE_UPLOAD"
          ? {
              fileName: submission.fileName,
              mimeType: submission.mimeType,
              fileSizeBytes: submission.fileSizeBytes,
            }
          : {}),
      },
    });

    const job = await this.jobService.enqueue({
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      masterIntent,
    });

    return { cvSource, cvSubmission, job };
  }

  // create() em vez de upsert(): duas requisições concorrentes com o mesmo
  // (dono, textSha256) e nenhum CvSource ainda existente podem ambas
  // observar "não existe" e tentar criar — a segunda perde a corrida do
  // índice único (userId_textSha256/talentSubjectId_textSha256) e
  // simplesmente relê a linha vencedora, igual ao padrão já usado em
  // CvMasterPromotionService para a corrida de PROMOTE_IF_FIRST. O objeto
  // no storage já foi escrito antes desta chamada com bytes determinísticos
  // pelo hash, então perder a corrida do INSERT nunca deixa um objeto órfão
  // nem diverge do conteúdo real.
  private async createSourceOrReuse(
    owner:
      | { ownerType: "USER"; userId: string }
      | { ownerType: "GUEST"; talentSubjectId: string },
    textStorageKey: string,
    textSha256: string,
  ) {
    try {
      return await this.database.cvSource.create({
        data: {
          ownerType: owner.ownerType,
          userId: owner.ownerType === "USER" ? owner.userId : null,
          talentSubjectId:
            owner.ownerType === "GUEST" ? owner.talentSubjectId : null,
          textStorageKey,
          textSha256,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return owner.ownerType === "USER"
          ? this.database.cvSource.findUniqueOrThrow({
              where: {
                userId_textSha256: { userId: owner.userId, textSha256 },
              },
            })
          : this.database.cvSource.findUniqueOrThrow({
              where: {
                talentSubjectId_textSha256: {
                  talentSubjectId: owner.talentSubjectId,
                  textSha256,
                },
              },
            });
      }
      throw error;
    }
  }
}
