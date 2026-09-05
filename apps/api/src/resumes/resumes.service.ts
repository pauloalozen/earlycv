import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { type Prisma, ResumeKind } from "@prisma/client";
import type { Response } from "express";
import type { FileUpload } from "../cv-adaptation/dto/create-cv-adaptation.dto";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { isCvStructuredProfilePipelineEnabled } from "../cv-processing/cv-processing.flags";
import { CvProcessingEntrypointService } from "../cv-processing/cv-processing-entrypoint.service";
import { CvProcessingFlagResolverService } from "../cv-processing/cv-processing-flag-resolver.service";
import { DatabaseService } from "../database/database.service";
import { MasterCvCanonicalExtractionService } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.service";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { StorageService } from "../storage/storage.service";
import type { CreateResumeDto } from "./dto/create-resume.dto";
import type {
  MasterCvExtractionCoverageDto,
  MasterCvExtractionStatusDto,
} from "./dto/master-cv-extraction-status.dto";
import type { UpdateResumeDto } from "./dto/update-resume.dto";

@Injectable()
export class ResumesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(StorageService)
    private readonly storage: Pick<StorageService, "getObject" | "putObject">,
    @Optional()
    @Inject(MasterCvCanonicalExtractionService)
    private readonly masterCvCanonicalExtractionService?: Pick<
      MasterCvCanonicalExtractionService,
      "enqueueFromMasterResumeUpload"
    >,
    @Optional()
    @Inject(CvProcessingEntrypointService)
    private readonly cvProcessingEntrypoint?: Pick<
      CvProcessingEntrypointService,
      "enqueueFromUserText"
    >,
    // Fase 2G — set-primary integrado ao pipeline canônico (plano, seção
    // "Integrar POST /resumes/:id/set-primary"). @Optional() pelo mesmo
    // motivo de cvProcessingEntrypoint acima: nunca referenciado com a
    // flag desligada, mantendo os testes legados de set-primary intocados.
    @Optional()
    @Inject(CvMasterPromotionService)
    private readonly cvMasterPromotion?: Pick<
      CvMasterPromotionService,
      "promoteAndProject" | "getActiveDesignation" | "supersedeIfResumeMatches"
    >,
    // Fase 3C item 4 — exclusão do Master: depois de supersedir a
    // designação ativa e limpar os campos derivados de CV do UserProfile
    // (dentro da transação de exclusão), o UserRadarProfile (projeção do
    // Monitor) também precisa refletir isso. @Optional() pelo mesmo motivo
    // dos demais: nunca referenciado pelos testes que instanciam
    // ResumesService diretamente com poucos argumentos; ausência só
    // desativa a reconciliação síncrona do radar (o MonitorProjectionJob
    // durável ainda fica persistido pra um consumidor futuro).
    @Optional()
    @Inject(UserRadarProfileService)
    private readonly userRadarProfile?: Pick<
      UserRadarProfileService,
      "refresh"
    >,
    // Fase 3 (pré-rollout) — resolução centralizada de ativação granular
    // (admin/allowlist), ver cv-processing-flag-resolver.service.ts.
    // @Optional() pelo mesmo motivo dos demais: nunca referenciado pelos
    // testes que instanciam este service diretamente com poucos
    // argumentos; ausência cai de volta na flag global pura (ver
    // #isPipelineEnabledFor), preservando comportamento anterior.
    @Optional()
    @Inject(CvProcessingFlagResolverService)
    private readonly flagResolver?: Pick<
      CvProcessingFlagResolverService,
      "isEnabledFor"
    >,
  ) {}

  private async isPipelineEnabledFor(userId: string): Promise<boolean> {
    if (this.flagResolver) {
      return this.flagResolver.isEnabledFor({ userId });
    }
    return isCvStructuredProfilePipelineEnabled();
  }

  list(userId: string) {
    return this.database.resume.findMany({
      where: { userId },
      orderBy: [{ isMaster: "desc" }, { updatedAt: "desc" }],
    });
  }

  async getById(userId: string, resumeId: string) {
    const resume = await this.database.resume.findFirst({
      where: {
        id: resumeId,
        userId,
      },
    });

    if (!resume) {
      throw new NotFoundException("resume not found");
    }

    return resume;
  }

  async getMasterCvExtractionStatus(
    userId: string,
  ): Promise<MasterCvExtractionStatusDto> {
    // Must reflect the extraction for the CURRENT upload (the most recently
    // created one), not "whichever extraction finished most recently" — a
    // replace upload creates a new pending/processing row while an older one
    // from a previous upload may already be "succeeded". Preferring the
    // already-finished one here made the frontend's polling see a false
    // "done" on the very first check and stop before the new extraction
    // (still running in the background) ever completed.
    const extraction =
      await this.database.masterCvCanonicalExtraction.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          status: true,
          coverageJson: true,
          updatedAt: true,
        },
      });

    if (!extraction) {
      return null;
    }

    return {
      status: extraction.status,
      extractionCoverage: this.parseExtractionCoverage(extraction.coverageJson),
      updatedAt: extraction.updatedAt.toISOString(),
    };
  }

  async create(
    userId: string,
    dto: CreateResumeDto,
    file?: FileUpload,
    turnstileToken?: string,
  ) {
    // Clearing the profile and uploading the replacement file used to be two
    // separate server actions (each triggering its own Next.js route
    // revalidation). That gap between the two round-trips raced with the
    // client-side polling that watches extraction status, leaving the screen
    // stuck on stale/empty data until a manual refresh. Folding the clear
    // into this same request removes that gap entirely.
    if (dto.clearExistingProfile) {
      await this.database.userProfile.updateMany({
        where: { userId },
        data: {
          fullName: null,
          contactEmail: null,
          phone: null,
          linkedinUrl: null,
          headline: null,
          city: null,
          state: null,
          country: null,
          professionalSummary: null,
          experiencesJson: [],
          educationJson: [],
          skillsJson: { technical: [], business: [], soft: [] },
          languagesJson: [],
          certificationsJson: [],
          profileReadinessStatus: "empty",
        },
      });
    }

    let sourceFileUrl: string | null = null;
    let extractedRawText: string | null = null;

    if (file) {
      if (!turnstileToken?.trim()) {
        throw new BadRequestException(
          "turnstileToken is required for master CV uploads",
        );
      }

      const key = `resumes/${userId}/${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
      sourceFileUrl = await this.storage.putObject(
        key,
        file.buffer,
        file.mimetype,
      );

      // Extract raw text from the file so the AI extraction step can use
      // plain text input, which works with any chat model and avoids
      // file_data format incompatibilities.
      try {
        const { extractTextFromCvFile } = await import(
          "../common/cv-text-extractor.js"
        );
        extractedRawText = await extractTextFromCvFile(file);
      } catch {
        // non-fatal — extraction will fall back to file-binary mode
      }
    } else if (dto.rawText?.trim()) {
      extractedRawText = dto.rawText.trim();
    }

    const createdResume = await this.database.$transaction(async (tx) => {
      const existingResumeCount = await tx.resume.count({ where: { userId } });
      const shouldBecomeMaster = dto.isPrimary ?? existingResumeCount === 0;

      if (shouldBecomeMaster) {
        // O CV master é um singleton: só existe UM ativo por vez, nunca um
        // histórico. Isso só é seguro apagar porque CvAdaptation.masterResumeId
        // agora é onDelete: SetNull (migration
        // 20260718160236_make_cv_adaptation_master_resume_optional) — apagar
        // o Resume nunca mais apaga a análise; ela sobrevive via
        // analysisCvSnapshot, que já é a fonte real do "CV usado na análise"
        // (ver createCvAdaptationResponseDto: canDownloadBaseCv/baseCvDownloadKind
        // dependem só do snapshot, nunca de masterResume). Antes disso era
        // Cascade e apagar aqui já destruiu análises reais — nunca reverter
        // essa premissa sem confirmar o onDelete atual da FK.
        const oldMasterResumes = await tx.resume.findMany({
          where: { userId, kind: ResumeKind.master },
          select: { id: true },
        });
        // Correção Fase 3C item 5 (achado escrevendo os testes da defesa
        // estrutural nova, migration 20260905160000_cv_master_designation_
        // integrity_defense): apagar um destes Resumes SEM antes supersedir
        // uma CvMasterDesignation ativa que ainda aponte pra ele violava a
        // invariante formal (designação ativa órfã) — o trigger
        // trg_prevent_delete_active_master_resume agora bloqueia isso no
        // banco, mas o caminho CERTO é nunca deixar acontecer: supersede
        // ANTES de apagar, na MESMA transação, reusando exatamente o método
        // já usado por ResumesService#remove() (mesmo advisory lock,
        // serializa com qualquer promoção concorrente pro mesmo usuário).
        // No-op quando não há designação ativa ainda, ou quando ela aponta
        // pra outro Resume (nada a fazer).
        if (this.cvMasterPromotion) {
          for (const old of oldMasterResumes) {
            await this.cvMasterPromotion.supersedeIfResumeMatches(
              tx,
              userId,
              old.id,
            );
          }
        }
        for (const old of oldMasterResumes) {
          // Resumes "adaptados" derivados do master antigo (basedOnResumeId)
          // também precisam ser apagados aqui: a constraint
          // Resume_adapted_requires_context_check exige templateId/targetJob*
          // OU basedOnResumeId — um SetNull simples os deixaria órfãos e
          // inválidos. O conteúdo real do CV adaptado não mora nesse resume
          // (é placeholder, recriado sob demanda por ensureAdaptedResumeRecord)
          // — o que baixa pro usuário vem de CvAdaptation.adaptedContentJson.
          await tx.resume.deleteMany({
            where: { userId, basedOnResumeId: old.id },
          });
        }
        await tx.resume.deleteMany({
          where: {
            userId,
            id: { in: oldMasterResumes.map((resume) => resume.id) },
          },
        });
        await this.demoteOtherResumes(tx, userId);
      }

      const createdResume = await tx.resume.create({
        data: {
          userId,
          title: dto.title,
          sourceFileName: dto.sourceFileName ?? file?.originalname ?? null,
          sourceFileType: file?.mimetype ?? null,
          sourceFileUrl,
          rawText: extractedRawText,
          status: dto.status ?? (file ? "uploaded" : "draft"),
          kind: ResumeKind.master,
          isMaster: shouldBecomeMaster,
        },
      });

      return createdResume;
    });

    // Fase 2 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md):
    // atrás de CV_STRUCTURED_PROFILE_PIPELINE_ENABLED. Ligada, substitui o
    // caminho legado ABAIXO para este entrypoint (nunca os dois — rodar os
    // dois pagaria a extração de IA em dobro); desligada, comportamento
    // inalterado. O enqueue novo é AWAITED (persiste CvSource/CvSubmission/
    // CvProcessingJob antes da resposta HTTP) — a extração de IA em si só
    // roda depois, no CvProcessingWorker (cron separado), nunca aqui.
    if (
      createdResume.isMaster &&
      (await this.isPipelineEnabledFor(userId)) &&
      this.cvProcessingEntrypoint
    ) {
      const text = extractedRawText?.trim();
      if (text) {
        try {
          await this.cvProcessingEntrypoint.enqueueFromUserText({
            userId,
            text,
            masterIntent: dto.isPrimary
              ? "PROMOTE_EXPLICIT"
              : "PROMOTE_IF_FIRST",
            // Bug #1 do piloto Fase 3B: este chamador nunca passava
            // resumeId, então CvMasterDesignation.resumeId ficava sempre
            // null pra todo Master promovido via upload direto (só era
            // corrigido se o usuário chamasse set-primary depois sobre o
            // mesmo Resume). createdResume.id já existe nesse ponto (criado
            // na transação acima) — passar aqui faz o CvProcessingWorker
            // (job.resumeId) rodar syncResumeIsMaster e a designação nascer
            // já com resumeId apontando pro Resume certo, mesmo quando o
            // CvSource é reaproveitado por hash (dedup) e quando o job é
            // reaproveitado por retry/concorrência (CvProcessingJobService
            // #enqueue já tem lógica de "upgrade" pra isso).
            resumeId: createdResume.id,
            submission: file
              ? {
                  origin: "FILE_UPLOAD",
                  fileName: file.originalname,
                  mimeType: file.mimetype,
                  fileSizeBytes: file.size,
                }
              : { origin: "PASTED_TEXT" },
          });
        } catch (error) {
          console.error(
            "[resumes] failed to enqueue cv processing job (new pipeline)",
            {
              error: error instanceof Error ? error.message : String(error),
              resumeId: createdResume.id,
              userId,
            },
          );
        }
      }
    } else if (
      createdResume.isMaster &&
      this.masterCvCanonicalExtractionService
    ) {
      try {
        await this.masterCvCanonicalExtractionService.enqueueFromMasterResumeUpload(
          {
            userId,
            resumeId: createdResume.id,
            ...(extractedRawText ? { rawText: extractedRawText } : {}),
            file: file
              ? {
                  buffer: file.buffer,
                  originalname: file.originalname,
                  mimetype: file.mimetype,
                  size: file.size,
                }
              : undefined,
          },
        );
      } catch (error) {
        console.error(
          "[resumes] failed to process master CV canonical extraction",
          {
            error: error instanceof Error ? error.message : String(error),
            resumeId: createdResume.id,
            userId,
          },
        );
      }
    }

    return createdResume;
  }

  private parseExtractionCoverage(
    value: unknown,
  ): MasterCvExtractionCoverageDto | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }

    const coverage = value as {
      identifiedFields?: unknown;
      missingFields?: unknown;
      fieldStatus?: unknown;
    };

    const fieldStatusRecord =
      coverage.fieldStatus &&
      typeof coverage.fieldStatus === "object" &&
      !Array.isArray(coverage.fieldStatus)
        ? coverage.fieldStatus
        : {};

    const fieldStatus: MasterCvExtractionCoverageDto["fieldStatus"] = {};
    for (const [field, status] of Object.entries(fieldStatusRecord)) {
      if (status === "filled" || status === "partial" || status === "missing") {
        fieldStatus[field] = status;
      }
    }

    return {
      identifiedFields: this.parseStringArray(coverage.identifiedFields),
      missingFields: this.parseStringArray(coverage.missingFields),
      fieldStatus,
    };
  }

  private parseStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === "string");
  }

  async update(userId: string, resumeId: string, dto: UpdateResumeDto) {
    const existingResume = await this.getById(userId, resumeId);

    return this.database.$transaction(async (tx) => {
      const otherResumeCount = await tx.resume.count({
        where: {
          userId,
          NOT: { id: resumeId },
        },
      });
      const shouldRemainMaster =
        dto.isPrimary === undefined
          ? existingResume.isMaster
          : dto.isPrimary ||
            (existingResume.isMaster && otherResumeCount === 0);

      if (shouldRemainMaster) {
        await this.demoteOtherResumes(tx, userId, resumeId);
      }

      const updateResult = await tx.resume.updateMany({
        where: { id: resumeId, userId },
        data: {
          title: dto.title,
          sourceFileName: dto.sourceFileName,
          status: dto.status,
          kind: shouldRemainMaster
            ? ResumeKind.master
            : this.resolveNonMasterKind(existingResume.kind),
          isMaster: shouldRemainMaster,
        },
      });

      if (updateResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }

      const updatedResume = await tx.resume.findFirst({
        where: { id: resumeId, userId },
      });

      if (!updatedResume) {
        throw new NotFoundException("resume not found");
      }

      return updatedResume;
    });
  }

  // Fase 3 (pré-rollout, docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
  // Tarefa 1) — CORRIGE a Fase 2G. A Fase 2G flipava Resume.isMaster de
  // forma síncrona e incondicional (mesmo com a flag ligada) numa
  // transação isolada, e SÓ DEPOIS tentava integrar com o pipeline
  // canônico — se a extração estivesse pendente/falhasse, o resultado era
  // um estado observável (por qualquer código que já lê Resume.isMaster
  // hoje: /meu-cv-master, /meu-perfil, cv-adaptation.service.ts na escolha
  // do Master para análise, admin) em que o Resume NOVO já era
  // isMaster=true mas CvMasterDesignation/UserProfile ainda apontavam pro
  // antigo (ou nem existiam) — exatamente a violação que o usuário pediu
  // para eliminar: "nunca existe um momento em que o sistema 'meio que
  // trocou'". O teste antigo (resumes.set-primary-canonical.e2e-spec.ts,
  // ver histórico do commit desta correção) documentava isso como
  // aceitável; não é.
  //
  // Correção: com a flag (central, ver CvProcessingFlagResolverService)
  // LIGADA para este usuário, o flip de Resume.isMaster deixa de ser
  // síncrono/incondicional — só acontece dentro da MESMA transação curta
  // que cria/supersede a CvMasterDesignation e sincroniza o UserProfile
  // (CvMasterPromotionService#promoteAndProject com syncResumeIsMaster:
  // true), e só depois que o CvStructuredProfile está READY:
  //  - Se já existe uma extração READY para a fonte do Resume alvo: tudo
  //    roda SÍNCRONO nesta mesma chamada — resposta já reflete o Master
  //    trocado (cvMasterPromotionStatus: "promoted").
  //  - Senão: enfileira um CvProcessingJob (masterIntent PROMOTE_EXPLICIT,
  //    carregando o resumeId alvo) e retorna JÁ — SEM tocar
  //    Resume.isMaster. O Master ANTIGO continua oficial em
  //    Resume.isMaster E em CvMasterDesignation até o worker
  //    (CvProcessingWorker) terminar a extração e promover, atômico, via
  //    o mesmo syncResumeIsMaster. O chamador faz polling em
  //    GET /cv-processing-jobs/:id (cvMasterPromotionStatus: "pending").
  //
  // Falha (extração ou promoção) nunca deixa nada meio-trocado: o flip só
  // acontece DEPOIS da promoção decidida, na mesma transação — se a
  // promoção falhar/lançar, a transação inteira reverte (nenhum flip
  // aconteceu) e o Master anterior permanece 100% intacto, tanto em
  // Resume.isMaster quanto em CvMasterDesignation. Por isso este método,
  // ao contrário da Fase 2G, NUNCA engole o erro da integração canônica —
  // faz sentido responder sucesso silencioso quando algo JÁ foi commitado
  // e não pode reverter (create()/claim, que tornam create() tolerante a
  // falha por design), mas aqui, se a integração falhar, NADA foi
  // commitado ainda — mentir "sucesso" faria o chamador achar que trocou
  // quando o Master antigo continua sendo o real.
  //
  // Flag desligada, ou dependências do pipeline ausentes (@Optional() não
  // resolvido): comportamento 100% legado, idêntico a antes da Fase 2G —
  // flip síncrono incondicional, sem nenhum campo novo na resposta.
  async setPrimary(userId: string, resumeId: string) {
    const pipelineEnabled = await this.isPipelineEnabledFor(userId);

    if (
      !pipelineEnabled ||
      !this.cvProcessingEntrypoint ||
      !this.cvMasterPromotion
    ) {
      return this.setPrimaryLegacy(userId, resumeId);
    }

    return this.setPrimaryCanonical(
      userId,
      resumeId,
      this.cvProcessingEntrypoint,
      this.cvMasterPromotion,
    );
  }

  // Comportamento legado, extraído sem nenhuma mudança de comportamento —
  // flip de Resume.isMaster síncrono e incondicional, mesma transação
  // curta de sempre. Usado quando a flag (central) está desligada para o
  // usuário, ou quando as dependências do pipeline canônico não estão
  // disponíveis (@Optional()).
  private async setPrimaryLegacy(userId: string, resumeId: string) {
    return this.database.$transaction(async (tx) => {
      const resume = await tx.resume.findFirst({
        where: {
          id: resumeId,
          userId,
        },
      });

      if (!resume) {
        throw new NotFoundException("resume not found");
      }

      await this.demoteOtherResumes(tx, userId, resume.id);

      const updateResult = await tx.resume.updateMany({
        where: { id: resume.id, userId },
        data: {
          kind: ResumeKind.master,
          isMaster: true,
        },
      });

      if (updateResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }

      return tx.resume.findFirstOrThrow({
        where: { id: resume.id, userId },
      });
    });
  }

  // Caminho canônico (flag ligada para este usuário): NUNCA flipa
  // Resume.isMaster fora da transação que também promove a
  // CvMasterDesignation (ver cabeçalho de #setPrimary acima).
  private async setPrimaryCanonical(
    userId: string,
    resumeId: string,
    entrypoint: Pick<CvProcessingEntrypointService, "enqueueFromUserText">,
    masterPromotion: Pick<
      CvMasterPromotionService,
      "promoteAndProject" | "getActiveDesignation"
    >,
  ) {
    const resume = await this.database.resume.findFirst({
      where: { id: resumeId, userId },
    });
    if (!resume) {
      throw new NotFoundException("resume not found");
    }

    // Idempotência: já é o Master ativo (Resume.isMaster e
    // CvMasterDesignation concordam) — no-op, sem nova promoção nem novo
    // job. Cobre "chamar set-primary duas vezes para o mesmo Resume".
    if (resume.isMaster) {
      const active = await masterPromotion.getActiveDesignation({
        ownerType: "USER",
        userId,
      });
      if (active?.resumeId === resume.id) {
        return {
          ...resume,
          cvProcessingJobId: null,
          cvMasterPromotionStatus: "promoted" as const,
        };
      }
    }

    if (resume.cvSourceId) {
      const readyProfile = await this.database.cvStructuredProfile.findFirst({
        where: { cvSourceId: resume.cvSourceId, status: "READY" },
        orderBy: { finishedAt: "desc" },
      });

      if (readyProfile) {
        // Síncrono: extração já pronta, então a troca inteira (designação
        // + Resume.isMaster + UserProfile + MonitorProjectionJob) roda
        // AGORA, numa única transação curta — sem estado intermediário
        // observável em nenhum momento.
        await masterPromotion.promoteAndProject({
          ownerType: "USER",
          userId,
          cvStructuredProfileId: readyProfile.id,
          resumeId: resume.id,
          masterIntent: "PROMOTE_EXPLICIT",
          promotedReason: "EXPLICIT_FLAG",
          canonicalProfile: readyProfile.canonicalJson as never,
          confidence:
            (readyProfile.confidenceJson as Record<string, number> | null) ??
            {},
          cvSourceId: resume.cvSourceId,
          syncResumeIsMaster: true,
        });

        const finalResume = await this.database.resume.findFirstOrThrow({
          where: { id: resume.id, userId },
        });
        return {
          ...finalResume,
          cvProcessingJobId: null,
          cvMasterPromotionStatus: "promoted" as const,
        };
      }
    }

    // Extração ainda não existe/não está READY — nunca troca
    // Resume.isMaster agora. Enfileira o processamento (reusa
    // MasterCvCanonicalExtraction legada via tryReuseLegacyExtraction
    // quando aplicável, dentro do worker) e devolve "pending": o Master
    // ANTIGO continua oficial (Resume.isMaster e CvMasterDesignation) até
    // o CvProcessingWorker terminar e promover, atômico, via
    // syncResumeIsMaster (ver cv-processing.worker.ts).
    const text = resume.rawText?.trim();
    if (!text) {
      throw new BadRequestException(
        "resume has no extractable content for the cv structured profile pipeline",
      );
    }

    const enqueued = await entrypoint.enqueueFromUserText({
      userId,
      text,
      masterIntent: "PROMOTE_EXPLICIT",
      submission: { origin: "PASTED_TEXT" },
      resumeId: resume.id,
    });

    // Guarantee #1 do plano ("Resume alvo possui CvSource"): liga o Resume
    // à fonte materializada assim que ela existe — isso NÃO afeta
    // Resume.isMaster (campo separado), só o vínculo com a fonte, então é
    // seguro persistir imediatamente (idempotente: enqueueFromUserText
    // dedupla por hash, então repetir esta chamada nunca cria uma segunda
    // fonte nem sobrescreve com dado diferente).
    if (!resume.cvSourceId) {
      await this.database.resume.update({
        where: { id: resume.id },
        data: {
          cvSourceId: enqueued.cvSource.id,
          cvSubmissionId: enqueued.cvSubmission.id,
        },
      });
    }

    return {
      ...resume,
      cvProcessingJobId: enqueued.job.id,
      cvMasterPromotionStatus: "pending" as const,
    };
  }

  async download(userId: string, resumeId: string, res: Response) {
    const resume = await this.getById(userId, resumeId);

    if (resume.sourceFileUrl) {
      const key = this.extractKeyFromUrl(resume.sourceFileUrl);
      if (key) {
        const sourceBuffer = await this.storage.getObject(key);
        const filename = resume.sourceFileName ?? "cv";

        res.setHeader(
          "Content-Type",
          resume.sourceFileType ?? "application/octet-stream",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${filename}"`,
        );
        res.send(sourceBuffer);
        return;
      }
    }

    const text = resume.rawText ?? "";
    const filename = resume.sourceFileName
      ? `${resume.sourceFileName.replace(/\.[^.]+$/, "")}.txt`
      : "cv.txt";

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(text);
  }

  // Fase 3C item 4 (correção do bug #3 do piloto 3B): quando o Resume
  // excluído é exatamente o Resume da CvMasterDesignation ATIVA do
  // usuário, a designação nunca pode ficar ativa e órfã (apontando pra um
  // Resume que não existe mais). Dentro da MESMA transação de exclusão
  // (CvMasterPromotionService#supersedeIfResumeMatches trava por advisory
  // lock, serializando com qualquer promoção concorrente):
  //  1. supersede a designação ativa (se e só se ela apontar pra este
  //     Resume — excluir um Resume comum nunca mexe em CvMasterDesignation);
  //  2. limpa SÓ os campos do UserProfile derivados de CV (mesmo escopo
  //     exato de dto.clearExistingProfile em create() acima) — preferências
  //     (remotePreference/relocationPreference/targetSalaryMin/Max/
  //     preferredLanguage/radarAreas/radarSeniority) e overrides manuais
  //     (profileFieldMetaJson) são preservados, nunca tocados aqui;
  //  3. persiste um MonitorProjectionJob(MASTER_REMOVED) durável — mesmo
  //     quando ainda não existe worker consumidor dele (registro/auditoria
  //     prontos pra quando existir, plano seção 17).
  // Depois que a transação (rápida — só updates de banco, sem IA) commita,
  // reconcilia o UserRadarProfile de forma síncrona best-effort — ele só lê
  // UserProfile (sem IA), então não compromete a velocidade da exclusão, e
  // evita deixar a projeção do Monitor visivelmente desatualizada até um
  // worker futuro processar o MonitorProjectionJob.
  async remove(userId: string, resumeId: string) {
    await this.getById(userId, resumeId);

    let masterDesignationSuperseded = false;

    await this.database.$transaction(async (tx) => {
      // Deletar um resume não "resgata"/promove outro a master — qualquer
      // resume que dependia dele (basedOnResumeId) perde o contexto de
      // origem e deixa de fazer sentido como dado, então é limpo junto em
      // vez de ficar órfão (o que violaria Resume_adapted_requires_context_check
      // quando o resume órfão não tem templateId/targetJobId/targetJobTitle).
      await tx.resume.deleteMany({
        where: { userId, basedOnResumeId: resumeId },
      });

      if (this.cvMasterPromotion) {
        const superseded =
          await this.cvMasterPromotion.supersedeIfResumeMatches(
            tx,
            userId,
            resumeId,
          );

        if (superseded) {
          masterDesignationSuperseded = true;

          await tx.userProfile.updateMany({
            where: { userId },
            data: {
              fullName: null,
              contactEmail: null,
              phone: null,
              linkedinUrl: null,
              headline: null,
              city: null,
              state: null,
              country: null,
              professionalSummary: null,
              experiencesJson: [],
              educationJson: [],
              skillsJson: { technical: [], business: [], soft: [] },
              languagesJson: [],
              certificationsJson: [],
              profileReadinessStatus: "empty",
            },
          });

          await tx.monitorProjectionJob.create({
            data: { userId, reason: "MASTER_REMOVED" },
          });
        }
      }

      const deleteResult = await tx.resume.deleteMany({
        where: { id: resumeId, userId },
      });

      if (deleteResult.count !== 1) {
        throw new NotFoundException("resume not found");
      }
    });

    if (masterDesignationSuperseded && this.userRadarProfile) {
      try {
        await this.userRadarProfile.refresh(userId);
      } catch (error) {
        console.error(
          "[resumes] failed to refresh radar profile after master removal",
          {
            error: error instanceof Error ? error.message : String(error),
            resumeId,
            userId,
          },
        );
      }
    }

    return { ok: true } as const;
  }

  private demoteOtherResumes(
    tx: Prisma.TransactionClient,
    userId: string,
    resumeIdToKeep?: string,
  ) {
    return tx.resume.updateMany({
      where: {
        userId,
        ...(resumeIdToKeep ? { NOT: { id: resumeIdToKeep } } : {}),
      },
      data: {
        isMaster: false,
      },
    });
  }

  private resolveNonMasterKind(kind: ResumeKind) {
    return kind;
  }

  private extractKeyFromUrl(url: string): string | null {
    const bucket = process.env.S3_BUCKET ?? "earlycv-local";
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  }
}
