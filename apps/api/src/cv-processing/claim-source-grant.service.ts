// Claim granular por fonte — Fase 2E
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seção 4).
//
// Diferente do claim legado (claimGuest/claimGuestAnalysisJob em
// cv-adaptation.service.ts, que continua existindo e funcionando igual),
// este serviço nunca transfere CvSource — cria só um ClaimSourceGrant
// (seção 4.1), que dá ao usuário acesso formal a uma fonte sem mudar seu
// dono original. Assume que o chamador (CvAdaptationService#
// claimGuestAnalysisJob) já verificou o guestPossessionToken e já
// reatribuiu AnalysisJob.userId ANTES de chamar claim() — este serviço
// nunca reverifica posse, só executa a parte nova (grant, resolução de
// sujeito, Master, Resume) dado um userId + AnalysisJob já confirmados.
//
// Toda a sequência roda em UMA ÚNICA transação Prisma (seção 4.2): ou
// tudo commita, ou nada commita. Chamar duas vezes com o mesmo
// analysisJobId é no-op na segunda chamada em cada passo (grant/
// equivalência protegidos por @@unique; resolução de sujeito guardada por
// TalentSubjectMergeEvent.triggeringAnalysisJobId; Master/Resume
// idempotentes por construção via CvMasterPromotionService/lookup por
// hash).
import { Inject, Injectable } from "@nestjs/common";
import {
  type ClaimSourceGrant,
  type CvProcessingJob,
  type CvSource,
  Prisma,
  type TalentProfile,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import {
  isSubjectMismatchError,
  MasterDesignationSubjectMismatchError,
} from "./cv-processing.errors";

export type ClaimSourceInput = {
  userId: string;
  analysisJobId: string;
  // CvProcessingJob da AnalysisJob sendo reivindicada — o chamador já
  // confirmou que ela existe (contrato: só chama este serviço quando
  // AnalysisJob.cvProcessingJobId não é nulo).
  cvProcessingJobId: string;
};

export type ClaimSourceEquivalenceResult = {
  primaryCvSourceId: string;
  equivalentCvSourceId: string;
} | null;

export type ClaimSubjectResolution = {
  talentSubjectId: string;
  reason: "CLAIM_FULL" | "CLAIM_PARTIAL_COPY";
} | null;

export type ClaimMasterResolution = {
  promoted: boolean;
  monitorProjectionJobId: string | null;
  resumeId: string | null;
} | null;

export type ClaimSourceResult = {
  cvSourceId: string;
  grantCreated: boolean;
  equivalence: ClaimSourceEquivalenceResult;
  subject: ClaimSubjectResolution;
  master: ClaimMasterResolution;
};

@Injectable()
export class ClaimSourceGrantService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvMasterPromotionService)
    private readonly masterPromotion: CvMasterPromotionService,
  ) {}

  async claim(input: ClaimSourceInput): Promise<ClaimSourceResult> {
    try {
      return await this.database.$transaction((tx) =>
        this.claimWithinTransaction(tx, input),
      );
    } catch (error) {
      throw this.translateSubjectMismatch(
        error,
        "Claim rejeitado no commit: a CvMasterDesignation criada pelo " +
          "claim não tem ownership nem ClaimSourceGrant válido sobre a " +
          "fonte (trigger trg_master_designation_subject_match, " +
          "DEFERRABLE INITIALLY DEFERRED). Nada desta transação foi " +
          "persistido — nem o grant, nem a resolução de sujeito, nem o " +
          "Resume. Trate como erro de domínio recuperável e chame " +
          "claim() de novo.",
      );
    }
  }

  // Extraído de claim() para permitir que outros donos de transação
  // (ex.: claimGuest() em cv-adaptation.service.ts, que já abre a própria
  // $transaction pra credito/CvUnlock/CvAdaptation) reusem exatamente a
  // mesma operação de domínio DENTRO da transação deles, em vez de abrir
  // uma segunda transação aninhada incompatível. O chamador é responsável
  // por: (a) só invocar isto quando já confirmou que a AnalysisJob de
  // origem tem cvProcessingJobId preenchido (mesmo contrato de
  // ClaimSourceInput); (b) traduzir isSubjectMismatchError no catch em
  // torno da PRÓPRIA transação externa (ver translateSubjectMismatch,
  // exportado como método público justamente pra isso).
  async claimWithinTransaction(
    tx: Prisma.TransactionClient,
    input: ClaimSourceInput,
  ): Promise<ClaimSourceResult> {
    const processingJob = await tx.cvProcessingJob.findUniqueOrThrow({
      where: { id: input.cvProcessingJobId },
    });
    const source = await tx.cvSource.findUniqueOrThrow({
      where: { id: processingJob.cvSourceId },
    });

    // Passo 2 (seção 4.2): grant idempotente. CvSource NUNCA muda de
    // dono aqui, com ou sem colisão de hash (seção 4.3) — só o grant é
    // criado.
    const grantCreated = await this.ensureGrant(
      tx,
      source.id,
      input.userId,
      input.analysisJobId,
    );

    // Seção 4.3: colisão de hash — equivalência leve, nunca fusão.
    const equivalence = await this.ensureEquivalenceIfCollision(
      tx,
      source,
      input.userId,
    );

    // Passo 5: resolução do sujeito (guardado por
    // triggeringAnalysisJobId pra idempotência da própria chamada).
    const subject = await this.resolveSubject(
      tx,
      source,
      input.userId,
      input.analysisJobId,
      processingJob,
    );

    // Passos 6-8: Master + Resume + projeção, quando a fonte
    // reivindicada é a designação ativa do guest.
    const master = await this.resolveMasterAndResume(
      tx,
      source,
      input.userId,
      processingJob,
      equivalence,
    );

    return {
      cvSourceId: source.id,
      grantCreated,
      equivalence,
      subject,
      master,
    };
  }

  // Público pra permitir que um chamador com transação própria (claimGuest())
  // traduza o mesmo erro de domínio no catch em torno da SUA transação —
  // o trigger é DEFERRABLE INITIALLY DEFERRED, então só dispara no commit
  // da transação externa, nunca dentro de claimWithinTransaction em si.
  translateSubjectMismatch(error: unknown, message: string): unknown {
    if (isSubjectMismatchError(error)) {
      return new MasterDesignationSubjectMismatchError(message, error);
    }
    return error;
  }

  // find-then-create (não create()+catch+releitura): dentro de uma
  // transação Prisma/Postgres, qualquer erro (inclusive uma violação de
  // unicidade esperada) deixa a transação inteira em estado abortado —
  // "current transaction is aborted, commands ignored until end of
  // transaction block" — nenhuma query subsequente na MESMA transação
  // funciona depois disso, mesmo um SELECT de releitura. Por isso o
  // padrão create()+catch(P2002)+releitura (usado em outros pontos do
  // módulo, ex. cv-master-promotion.service.ts) só é seguro quando a
  // releitura acontece numa transação NOVA/fora de transação — aqui
  // precisamos continuar operando na MESMA transação do claim (grant +
  // resolução de sujeito + Master precisam ver o grant recém-criado
  // antes do commit), então checamos primeiro e só criamos se realmente
  // não existir. Cobre com segurança o caso relevante pro claim
  // (chamadas sequenciais idempotentes — mesmo jobId chamado duas vezes).
  // Uma corrida verdadeiramente concorrente (duas chamadas de claim() em
  // voo ao mesmo tempo pra mesma fonte) ainda pode colidir no create();
  // nesse caso a transação perdedora falha inteira (não deixa estado
  // parcial) e quem chamou trata como erro recuperável — retry encontra
  // o grant já commitado pela vencedora neste mesmo pre-check.
  private async ensureGrant(
    tx: Prisma.TransactionClient,
    cvSourceId: string,
    userId: string,
    analysisJobId: string,
  ): Promise<boolean> {
    const existing: ClaimSourceGrant | null =
      await tx.claimSourceGrant.findUnique({
        where: { cvSourceId_userId: { cvSourceId, userId } },
      });
    if (existing) return false;

    await tx.claimSourceGrant.create({
      data: {
        cvSourceId,
        userId,
        provenByAnalysisJobId: analysisJobId,
      },
    });
    return true;
  }

  // Seção 4.3: se o usuário já possui um CvSource próprio com o mesmo
  // textSha256 do CvSource do guest, registra a equivalência (só
  // navegação/auditoria) — nunca reprocessa extração, nunca reaponta FK
  // histórica.
  private async ensureEquivalenceIfCollision(
    tx: Prisma.TransactionClient,
    source: CvSource,
    userId: string,
  ): Promise<ClaimSourceEquivalenceResult> {
    if (source.ownerType === "USER" && source.userId === userId) {
      // A própria fonte já é do usuário — nunca deveria acontecer no
      // caminho de claim (que só existe para fontes GUEST), mas é
      // logicamente um no-op seguro.
      return null;
    }

    const ownSource = await tx.cvSource.findUnique({
      where: {
        userId_textSha256: { userId, textSha256: source.textSha256 },
      },
    });

    if (!ownSource || ownSource.id === source.id) {
      return null;
    }

    // find-then-create (nunca create()+catch(P2002) aqui — ver comentário
    // de ensureGrant: um erro capturado no meio desta transação a deixa
    // abortada pro RESTO da transação inteira, não só pra próxima query,
    // então "engolir" a violação e seguir em frente quebraria os passos
    // seguintes do claim, não só este).
    const existingEquivalence = await tx.cvSourceEquivalence.findUnique({
      where: {
        primaryCvSourceId_equivalentCvSourceId: {
          primaryCvSourceId: ownSource.id,
          equivalentCvSourceId: source.id,
        },
      },
    });
    if (!existingEquivalence) {
      await tx.cvSourceEquivalence.create({
        data: {
          primaryCvSourceId: ownSource.id,
          equivalentCvSourceId: source.id,
        },
      });
    }

    return { primaryCvSourceId: ownSource.id, equivalentCvSourceId: source.id };
  }

  // Passo 5 (seção 4.2): lista as TalentProfileSource do TalentSubject da
  // fonte reivindicada. Se TODAS já têm ClaimSourceGrant para este
  // userId, funde (CLAIM_FULL); senão, copia só as observações da fonte
  // reivindicada (CLAIM_PARTIAL_COPY). Sem captura de talento ainda
  // (CvProcessingJob não READY, ou nenhuma TalentProfileSource pra essa
  // fonte), não há nada a resolver.
  private async resolveSubject(
    tx: Prisma.TransactionClient,
    source: CvSource,
    userId: string,
    analysisJobId: string,
    processingJob: CvProcessingJob,
  ): Promise<ClaimSubjectResolution> {
    if (processingJob.status !== "READY") return null;

    const profileSource = await tx.talentProfileSource.findFirst({
      where: { cvSourceId: source.id },
    });
    if (!profileSource) return null;

    const guestProfile = await tx.talentProfile.findUniqueOrThrow({
      where: { id: profileSource.talentProfileId },
    });
    if (!guestProfile.talentSubjectId) return null;

    const talentSubjectId = guestProfile.talentSubjectId;

    // Idempotência da própria chamada: mesma AnalysisJob já resolveu o
    // sujeito antes (não reavalia nem duplica evento/cópia).
    const existingEvent = await tx.talentSubjectMergeEvent.findFirst({
      where: { triggeringAnalysisJobId: analysisJobId },
    });
    if (existingEvent) {
      return {
        talentSubjectId,
        reason: existingEvent.reason as "CLAIM_FULL" | "CLAIM_PARTIAL_COPY",
      };
    }

    const allSources = await tx.talentProfileSource.findMany({
      where: { talentProfileId: guestProfile.id },
    });
    const grants = await tx.claimSourceGrant.findMany({
      where: {
        userId,
        cvSourceId: { in: allSources.map((entry) => entry.cvSourceId) },
      },
    });
    const grantedIds = new Set(grants.map((grant) => grant.cvSourceId));
    const allGranted = allSources.every((entry) =>
      grantedIds.has(entry.cvSourceId),
    );

    if (allGranted) {
      const userProfile = await tx.talentProfile.findUnique({
        where: { userId },
      });

      // Achado real em teste manual (2026-09-09): entre este SELECT e o
      // UPDATE abaixo, outro caminho completamente alheio ao claim (ex.:
      // CvTalentCaptureService#findOrCreateTalentProfile, disparado por
      // uma extração autenticada comum deste MESMO usuário rodando em
      // paralelo) pode criar um TalentProfile(userId) do zero — violando
      // o @@unique([userId]) no UPDATE de reaponte abaixo. Mesma classe de
      // corrida que findOrCreateUserProfile já trata (comentário logo
      // abaixo), só que aqui o reaponte "zero cópia" não tinha esse
      // tratamento. Em vez de propagar cru pro chamador (o worker
      // marcaria a análise inteira como "failed", terminal, sem retry —
      // pior ainda que o antigo bug de linhagem), relê e cai pro caminho
      // de cópia (idêntico ao branch "userProfile já existia" abaixo).
      let resolvedUserProfile = userProfile;
      if (!resolvedUserProfile) {
        try {
          await tx.talentProfile.update({
            where: { id: guestProfile.id },
            data: { userId, talentSubjectId: null },
          });
          await tx.talentSubject.update({
            where: { id: talentSubjectId },
            data: {
              mergedIntoUserId: userId,
              mergedIntoTalentProfileId: guestProfile.id,
              mergedAt: new Date(),
            },
          });
        } catch (error) {
          if (
            !(error instanceof Prisma.PrismaClientKnownRequestError) ||
            error.code !== "P2002"
          ) {
            throw error;
          }
          resolvedUserProfile = await tx.talentProfile.findUniqueOrThrow({
            where: { userId },
          });
        }
      }

      if (resolvedUserProfile) {
        const userProfileForMerge = resolvedUserProfile;
        await this.copyObservations(
          tx,
          guestProfile.id,
          userProfileForMerge.id,
        );
        await this.copyProfileSources(
          tx,
          guestProfile.id,
          userProfileForMerge.id,
        );
        await tx.talentProfile.update({
          where: { id: guestProfile.id },
          data: { mergedIntoTalentProfileId: userProfileForMerge.id },
        });
        await tx.talentSubject.update({
          where: { id: talentSubjectId },
          data: {
            mergedIntoUserId: userId,
            mergedIntoTalentProfileId: userProfileForMerge.id,
            mergedAt: new Date(),
          },
        });
      }

      await tx.talentSubjectMergeEvent.create({
        data: {
          talentSubjectId,
          targetUserId: userId,
          reason: "CLAIM_FULL",
          triggeringAnalysisJobId: analysisJobId,
        },
      });

      return { talentSubjectId, reason: "CLAIM_FULL" };
    }

    // Parcial: copia (insert, nunca move) só as observações da fonte
    // reivindicada — TalentProfile/TalentSubject do guest continuam
    // intactos.
    const userProfile = await this.findOrCreateUserProfile(tx, userId);
    const claimedStructuredProfiles = await tx.cvStructuredProfile.findMany({
      where: { cvSourceId: source.id },
      select: { id: true },
    });
    const structuredProfileIds = claimedStructuredProfiles.map(
      (entry) => entry.id,
    );

    await this.copyObservations(
      tx,
      guestProfile.id,
      userProfile.id,
      structuredProfileIds,
    );
    await tx.talentProfileSource.upsert({
      where: {
        talentProfileId_cvSourceId: {
          talentProfileId: userProfile.id,
          cvSourceId: source.id,
        },
      },
      create: { talentProfileId: userProfile.id, cvSourceId: source.id },
      update: {},
    });

    await tx.talentSubjectMergeEvent.create({
      data: {
        talentSubjectId,
        targetUserId: userId,
        reason: "CLAIM_PARTIAL_COPY",
        triggeringAnalysisJobId: analysisJobId,
      },
    });

    return { talentSubjectId, reason: "CLAIM_PARTIAL_COPY" };
  }

  // Mesmo padrão create()+catch(P2002)+reread já usado em
  // cv-talent-capture.service.ts#findOrCreateTalentProfile.
  // find-then-create (ver comentário de ensureGrant sobre por que não dá
  // pra catch(P2002)+reler na MESMA transação): o pre-check já cobre com
  // segurança o caso relevante (chamadas sequenciais idempotentes). Uma
  // corrida verdadeiramente concorrente propaga o erro — a transação
  // perdedora falha inteira, sem estado parcial, e quem chamou trata como
  // recuperável (retry encontra o TalentProfile já commitado no
  // pre-check).
  private async findOrCreateUserProfile(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<TalentProfile> {
    const existing = await tx.talentProfile.findUnique({ where: { userId } });
    if (existing) return existing;

    return tx.talentProfile.create({ data: { userId } });
  }

  // Copia observações por fingerprint (insert-only, nunca duplica — a
  // constraint @@unique de cada tabela de observação garante isso mesmo
  // sob retry). Quando structuredProfileIds é omitido, copia TODAS as
  // observações do perfil de origem (uso: merge completo). Quando
  // fornecido, copia só as observações daqueles CvStructuredProfile (uso:
  // cópia parcial de uma única fonte reivindicada).
  private async copyObservations(
    tx: Prisma.TransactionClient,
    fromTalentProfileId: string,
    toTalentProfileId: string,
    structuredProfileIds?: string[],
  ): Promise<void> {
    const scope = structuredProfileIds
      ? { in: structuredProfileIds }
      : undefined;

    const education = await tx.talentEducationObservation.findMany({
      where: {
        talentProfileId: fromTalentProfileId,
        ...(scope ? { cvStructuredProfileId: scope } : {}),
      },
    });
    for (const item of education) {
      await tx.talentEducationObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId: toTalentProfileId,
            cvStructuredProfileId: item.cvStructuredProfileId,
            itemFingerprint: item.itemFingerprint,
            itemIndex: item.itemIndex,
          },
        },
        create: {
          talentProfileId: toTalentProfileId,
          cvStructuredProfileId: item.cvStructuredProfileId,
          itemFingerprint: item.itemFingerprint,
          itemIndex: item.itemIndex,
          institutionRaw: item.institutionRaw,
          degreeRaw: item.degreeRaw,
          fieldOfStudyRaw: item.fieldOfStudyRaw,
          periodRaw: item.periodRaw,
        },
        update: {},
      });
    }

    const competencies = await tx.talentCompetencyObservation.findMany({
      where: {
        talentProfileId: fromTalentProfileId,
        ...(scope ? { cvStructuredProfileId: scope } : {}),
      },
    });
    for (const item of competencies) {
      await tx.talentCompetencyObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId: toTalentProfileId,
            cvStructuredProfileId: item.cvStructuredProfileId,
            itemFingerprint: item.itemFingerprint,
            itemIndex: item.itemIndex,
          },
        },
        create: {
          talentProfileId: toTalentProfileId,
          cvStructuredProfileId: item.cvStructuredProfileId,
          category: item.category,
          itemFingerprint: item.itemFingerprint,
          itemIndex: item.itemIndex,
          valueRaw: item.valueRaw,
          proficiencyLevelRaw: item.proficiencyLevelRaw,
        },
        update: {},
      });
    }

    const languages = await tx.talentLanguageObservation.findMany({
      where: {
        talentProfileId: fromTalentProfileId,
        ...(scope ? { cvStructuredProfileId: scope } : {}),
      },
    });
    for (const item of languages) {
      await tx.talentLanguageObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId: toTalentProfileId,
            cvStructuredProfileId: item.cvStructuredProfileId,
            itemFingerprint: item.itemFingerprint,
            itemIndex: item.itemIndex,
          },
        },
        create: {
          talentProfileId: toTalentProfileId,
          cvStructuredProfileId: item.cvStructuredProfileId,
          itemFingerprint: item.itemFingerprint,
          itemIndex: item.itemIndex,
          languageRaw: item.languageRaw,
          proficiencyLevelRaw: item.proficiencyLevelRaw,
        },
        update: {},
      });
    }

    const certifications = await tx.talentCertificationObservation.findMany({
      where: {
        talentProfileId: fromTalentProfileId,
        ...(scope ? { cvStructuredProfileId: scope } : {}),
      },
    });
    for (const item of certifications) {
      await tx.talentCertificationObservation.upsert({
        where: {
          talentProfileId_cvStructuredProfileId_itemFingerprint_itemIndex: {
            talentProfileId: toTalentProfileId,
            cvStructuredProfileId: item.cvStructuredProfileId,
            itemFingerprint: item.itemFingerprint,
            itemIndex: item.itemIndex,
          },
        },
        create: {
          talentProfileId: toTalentProfileId,
          cvStructuredProfileId: item.cvStructuredProfileId,
          itemFingerprint: item.itemFingerprint,
          itemIndex: item.itemIndex,
          nameRaw: item.nameRaw,
          issuerRaw: item.issuerRaw,
          yearRaw: item.yearRaw,
        },
        update: {},
      });
    }
  }

  // Merge completo: copia TODAS as TalentProfileSource do guest pro
  // perfil do usuário (upsert por @@unique — nunca duplica).
  private async copyProfileSources(
    tx: Prisma.TransactionClient,
    fromTalentProfileId: string,
    toTalentProfileId: string,
  ): Promise<void> {
    const sources = await tx.talentProfileSource.findMany({
      where: { talentProfileId: fromTalentProfileId },
    });
    for (const entry of sources) {
      await tx.talentProfileSource.upsert({
        where: {
          talentProfileId_cvSourceId: {
            talentProfileId: toTalentProfileId,
            cvSourceId: entry.cvSourceId,
          },
        },
        create: {
          talentProfileId: toTalentProfileId,
          cvSourceId: entry.cvSourceId,
        },
        update: {},
      });
    }
  }

  // Passos 6-8 (seção 4.2): só age quando a fonte reivindicada é
  // exatamente a designação ativa do TalentSubject do guest. Se o
  // usuário já tem Master ativo, a designação do guest fica intacta,
  // nunca ativada — só o grant (já criado acima) muda.
  private async resolveMasterAndResume(
    tx: Prisma.TransactionClient,
    source: CvSource,
    userId: string,
    processingJob: CvProcessingJob,
    equivalence: ClaimSourceEquivalenceResult,
  ): Promise<ClaimMasterResolution> {
    if (
      processingJob.status !== "READY" ||
      !processingJob.cvStructuredProfileId
    ) {
      return null;
    }
    if (source.ownerType !== "GUEST" || !source.talentSubjectId) {
      return null;
    }

    const userActive = await tx.cvMasterDesignation.findFirst({
      where: { userId, supersededAt: null },
    });

    // Idempotência de retry: uma chamada anterior deste mesmo claim já
    // promoveu (e já supersedeu a designação guest, ver update logo
    // abaixo) — a designação guest não vai mais aparecer como "ativa" na
    // busca seguinte, então precisamos reconhecer esse caso ANTES de
    // procurar guestActive, ou uma segunda chamada devolveria master: null
    // em vez do mesmo resumeId (quebraria o contrato "claim() é
    // idempotente").
    if (
      userActive &&
      userActive.cvStructuredProfileId === processingJob.cvStructuredProfileId
    ) {
      const resumeId =
        userActive.resumeId ??
        (await this.ensureResume(tx, userId, source, equivalence));
      return { promoted: false, monitorProjectionJobId: null, resumeId };
    }

    const guestActive = await tx.cvMasterDesignation.findFirst({
      where: { talentSubjectId: source.talentSubjectId, supersededAt: null },
      include: { cvStructuredProfile: true },
    });

    if (
      !guestActive ||
      guestActive.cvStructuredProfile.cvSourceId !== source.id
    ) {
      // A fonte reivindicada não é (ou deixou de ser) o Master provisório
      // do guest — nada a promover.
      return null;
    }

    if (
      userActive &&
      userActive.cvStructuredProfileId !== processingJob.cvStructuredProfileId
    ) {
      // Usuário já tem Master ativo (de OUTRA fonte) — designação do guest
      // preservada, nunca ativada (só o grant já criado dá acesso formal à
      // fonte).
      return { promoted: false, monitorProjectionJobId: null, resumeId: null };
    }

    const structuredProfile = await tx.cvStructuredProfile.findUniqueOrThrow({
      where: { id: processingJob.cvStructuredProfileId },
    });

    const resumeId = await this.ensureResume(tx, userId, source, equivalence);

    const promotion =
      await this.masterPromotion.promoteAndProjectWithinTransaction(tx, {
        ownerType: "USER",
        userId,
        cvStructuredProfileId: structuredProfile.id,
        resumeId,
        masterIntent: "PROMOTE_IF_FIRST",
        promotedReason: "CLAIM_PROMOTION",
        canonicalProfile: structuredProfile.canonicalJson as never,
        confidence:
          (structuredProfile.confidenceJson as Record<string, number> | null) ??
          {},
        cvSourceId: source.id,
        // Fase 3C item 1/5 — correção da premissa antiga de ensureResume
        // (comentário abaixo, mantido pra contexto histórico): a invariante
        // formalizada nesta fase (schema.prisma, comentário de
        // CvMasterDesignation) exige que o Resume da designação ativa
        // SEMPRE tenha isMaster=true — sem exceção pra claim. Sem
        // syncResumeIsMaster aqui, um claim que promove o primeiro Master
        // do usuário deixava CvMasterDesignation e Resume.isMaster
        // divergentes (a mesma classe de bug do achado #2 do piloto 3B),
        // e violaria a nova defesa estrutural (migration
        // 20260905_cv_master_designation_integrity_defense) que exige isso
        // no banco. Seguro aqui: masterIntent é sempre PROMOTE_IF_FIRST
        // neste caminho (só chega até aqui quando o usuário ainda não tem
        // designação ativa — ver checagem de userActive acima), então o
        // flip nunca compete com um Master de outra fonte.
        syncResumeIsMaster: true,
      });

    // Fecha o gap encontrado auditando cv-master-promotion.service.ts:
    // runPromotionDecision só enxerga/supersede designações do MESMO dono
    // (userId OU talentSubjectId, nunca os dois) — promover o Master do
    // usuário nunca supersede sozinho a designação guest de origem. Sem
    // isto, as duas ficavam ativas ao mesmo tempo (achado real do teste
    // manual: CvMasterDesignation guest com supersededAt nulo mesmo depois
    // do claim). Só supersede quando a promoção de fato aconteceu agora
    // (promotion.changed) — nunca num retry idempotente (esse caso já
    // retorna mais acima, antes de guestActive ser reconsultado).
    if (promotion.changed) {
      await tx.cvMasterDesignation.updateMany({
        where: { id: guestActive.id, supersededAt: null },
        data: { supersededAt: new Date() },
      });
    }

    return {
      promoted: promotion.changed,
      monitorProjectionJobId: promotion.monitorProjectionJobId,
      resumeId,
    };
  }

  // Passo 7 (seção 4.2): reusa um Resume existente do usuário que já
  // aponte pra um CvSource com o mesmo hash (ownership direto ou grant);
  // senão cria um novo Resume + CvSubmission(origin: CLAIM) apontando
  // pra fonte à qual o usuário tem acesso válido — a própria (se colisão
  // de hash já existia), a do guest (via grant) caso contrário. Nunca
  // copia/realoca o CvSource.
  //
  // isMaster: false aqui é só o valor INICIAL na criação — nunca o valor
  // final quando este Resume vira o Master. Correção Fase 3C item 1/5
  // (substitui a premissa antiga desta nota, que dizia "deliberadamente
  // false pra sempre"): essa premissa dependia do bug #1 do piloto 3B
  // (CvProcessingWorker nunca recebia resumeId, então nunca rodava
  // syncResumeIsMaster) — corrigido nesta fase. resolveMasterAndResume
  // (chamador) agora passa syncResumeIsMaster: true, então, quando este
  // Resume efetivamente se torna o Master (promotion.changed === true), o
  // flip pra isMaster: true acontece atômico com a CvMasterDesignation, na
  // MESMA transação — nunca fica divergente.
  private async ensureResume(
    tx: Prisma.TransactionClient,
    userId: string,
    source: CvSource,
    equivalence: ClaimSourceEquivalenceResult,
  ): Promise<string> {
    const existing = await tx.resume.findFirst({
      where: { userId, cvSource: { textSha256: source.textSha256 } },
    });
    if (existing) return existing.id;

    const targetCvSourceId = equivalence?.primaryCvSourceId ?? source.id;

    const submission = await tx.cvSubmission.create({
      data: { cvSourceId: targetCvSourceId, origin: "CLAIM" },
    });

    // Preserva o nome original do arquivo que o guest enviou (mesma
    // convenção do upload autenticado normal, resumes.service.ts#create —
    // sourceFileName = file.originalname, title = nome sem extensão), em
    // vez do texto fixo "CV reivindicado" que não dizia ao usuário qual
    // arquivo foi usado. A fonte original (FILE_UPLOAD) fica na primeira
    // CvSubmission daquele CvSource; texto colado (PASTED_TEXT) não tem
    // nome de arquivo, mesmo fallback usado no upload de texto colado no
    // frontend ("Meu CV").
    const originalSubmission = await tx.cvSubmission.findFirst({
      where: { cvSourceId: source.id, origin: "FILE_UPLOAD" },
      orderBy: { submittedAt: "asc" },
      select: { fileName: true },
    });
    const originalFileName = originalSubmission?.fileName?.trim() || null;
    const title = originalFileName
      ? originalFileName.replace(/\.[^.]+$/, "")
      : "Meu CV";

    const resume = await tx.resume.create({
      data: {
        userId,
        title,
        sourceFileName: originalFileName,
        kind: "master",
        status: "uploaded",
        isMaster: false,
        cvSourceId: targetCvSourceId,
        cvSubmissionId: submission.id,
      },
    });

    return resume.id;
  }
}
