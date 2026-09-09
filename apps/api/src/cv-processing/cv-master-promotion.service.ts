// Promoção de Master — plano, seção 10 (semântica de concorrência, fechada
// e corrigida na v3):
//
// - PROMOTE_IF_FIRST: só se aplica quando NÃO existe designação ativa para
//   aquele dono. A primeira a conseguir criar a linha vence; as seguintes
//   viram no-op (nunca substituem, nunca erro).
// - PROMOTE_EXPLICIT: ordem explícita do usuário. Quando duas chegam
//   concorrentes, a que COMMITAR POR ÚLTIMO fica ativa — SELECT ... FOR
//   UPDATE serializa as transações concorrentes na linha ativa existente;
//   quem pega o lock primeiro processa primeiro, mas como cada uma marca a
//   ativa anterior como superseded e insere a própria como nova ativa, a
//   última a rodar (e commitar) é sempre a que fica valendo por último.
//
// Em qualquer caso: no máximo uma CvMasterDesignation ativa
// (supersededAt IS NULL) por dono, garantido pelos índices únicos parciais
// da migration de Fase 1 (cv_master_designation_active_user/_guest).
import { Inject, Injectable } from "@nestjs/common";
import {
  type CvMasterDesignation,
  type CvMasterPromotionReason,
  type CvSourceOwnerType,
  Prisma,
  ResumeKind,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  isSubjectMismatchError,
  MasterDesignationSubjectMismatchError,
} from "./cv-processing.errors";
import {
  type CanonicalProfileForSync,
  CvUserProfileSyncService,
} from "./cv-user-profile-sync.service";

export type MasterOwnerRef =
  | { ownerType: "USER"; userId: string; talentSubjectId?: undefined }
  | { ownerType: "GUEST"; talentSubjectId: string; userId?: undefined };

export type PromoteMasterInput = MasterOwnerRef & {
  cvStructuredProfileId: string;
  resumeId?: string | null;
  masterIntent: "PROMOTE_IF_FIRST" | "PROMOTE_EXPLICIT";
  promotedReason: CvMasterPromotionReason;
  // Correção da Fase 3 (pré-rollout, resumes.service.ts#setPrimary): quando
  // true (só resumes.service.ts#setPrimary liga isto hoje — nunca o
  // CvProcessingWorker para os entrypoints de create()/análise, que
  // decidem Resume.isMaster no momento de CRIAR o Resume, fora de escopo
  // desta correção), o flip de Resume.isMaster (demover os outros Resumes
  // do dono, promover `resumeId`) acontece DENTRO desta mesma transação,
  // JUNTO com a CvMasterDesignation — nunca antes, nunca depois. Só tem
  // efeito quando ownerType === "USER" && resumeId presente && a
  // designação ativa AO FINAL desta chamada aponta exatamente para
  // `cvStructuredProfileId` (cobre os três casos em que isso é verdade:
  // criada agora, substituída agora, ou já era a ativa — idempotência); se
  // a designação ativa final for de outro perfil (ex.: PROMOTE_IF_FIRST
  // bloqueado por já existir Master de outra fonte), o flip nunca
  // acontece — Resume.isMaster não pode mentir sobre quem é o Master real.
  // Default false: nenhum caller pré-existente (CvProcessingWorker,
  // ClaimSourceGrantService) muda de comportamento por esta adição.
  syncResumeIsMaster?: boolean;
};

export type PromoteMasterResult = {
  // true só quando a designação ativa ao final é DIFERENTE da que existia
  // antes desta chamada começar (seção 17: só isso justifica
  // MonitorProjectionJob).
  changed: boolean;
  reason: "MASTER_CREATED" | "MASTER_REPLACED" | null;
  activeDesignation: CvMasterDesignation;
};

export type PromoteMasterAndProjectInput = PromoteMasterInput & {
  // Necessários só quando ownerType === "USER" e há chance real de
  // sincronizar UserProfile (a sync só roda se o Master de fato mudar
  // nesta chamada — seção 17). Para ownerType === "GUEST" são ignorados
  // (guest não tem UserProfile nem MonitorProjectionJob — o schema exige
  // MonitorProjectionJob.userId not-null).
  canonicalProfile?: CanonicalProfileForSync;
  confidence?: Record<string, number>;
  cvSourceId?: string;
};

export type PromoteMasterAndProjectResult = PromoteMasterResult & {
  monitorProjectionJobId: string | null;
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class CvMasterPromotionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CvUserProfileSyncService)
    private readonly userProfileSync: CvUserProfileSyncService,
  ) {}

  async promote(input: PromoteMasterInput): Promise<PromoteMasterResult> {
    try {
      return await this.database.$transaction(async (tx) => {
        return this.runPromotionCore(tx, input);
      });
    } catch (error) {
      if (isSubjectMismatchError(error)) {
        throw new MasterDesignationSubjectMismatchError(
          "CvMasterDesignation rejeitada no commit: o dono não tem ownership " +
            "nem ClaimSourceGrant válido sobre a fonte da extração (trigger " +
            "trg_master_designation_subject_match, DEFERRABLE INITIALLY " +
            "DEFERRED). Trate como erro de domínio recuperável: reavalie o " +
            "estado atual e tente novamente, nunca reenvie o mesmo INSERT.",
          error,
        );
      }
      throw error;
    }
  }

  // Unidade durável completa (plano, seção 1.1 item 4 / seção 4.2 item 6):
  // promove/substitui o Master, sincroniza UserProfile e cria o
  // MonitorProjectionJob DENTRO da mesma transação — nunca em passos
  // separados. Se o COMMIT falhar pela trigger deferred de subject-match,
  // TUDO (inclusive o MonitorProjectionJob) é revertido — não sobra nenhum
  // estado intermediário observável, e o chamador recebe
  // MasterDesignationSubjectMismatchError em vez da exceção crua do
  // Postgres/Prisma. Retry: chame este método de novo — ele sempre
  // reavalia o estado ativo do banco do zero (nunca reenvia o INSERT
  // anterior).
  async promoteAndProject(
    input: PromoteMasterAndProjectInput,
  ): Promise<PromoteMasterAndProjectResult> {
    try {
      return await this.database.$transaction((tx) =>
        this.promoteAndProjectWithinTransaction(tx, input),
      );
    } catch (error) {
      if (isSubjectMismatchError(error)) {
        throw new MasterDesignationSubjectMismatchError(
          "CvMasterDesignation rejeitada no commit: o dono não tem ownership " +
            "nem ClaimSourceGrant válido sobre a fonte da extração (trigger " +
            "trg_master_designation_subject_match, DEFERRABLE INITIALLY " +
            "DEFERRED). Nada desta transação foi persistido (promoção, sync " +
            "de UserProfile e MonitorProjectionJob incluídos) — trate como " +
            "erro de domínio recuperável: reavalie o estado atual e tente " +
            "novamente, nunca reenvie o mesmo INSERT.",
          error,
        );
      }
      throw error;
    }
  }

  // Fase 2E (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
  // seção 4.2 item 6): extraído de promoteAndProject pra permitir que o
  // claim granular (ClaimSourceGrantService) rode a promoção de Master +
  // sync de UserProfile + MonitorProjectionJob DENTRO da MESMA transação
  // que já criou o ClaimSourceGrant/resolveu o sujeito — nunca em uma
  // segunda transação separada (isso quebraria a garantia de "tudo
  // commita ou nada commita" do claim). O chamador é responsável por
  // envolver esta chamada na própria $transaction e por tratar
  // isSubjectMismatchError no catch em torno dela (promoteAndProject
  // continua fazendo isso sozinho pro caso de uso avulso, sem claim).
  async promoteAndProjectWithinTransaction(
    tx: Prisma.TransactionClient,
    input: PromoteMasterAndProjectInput,
  ): Promise<PromoteMasterAndProjectResult> {
    const promotion = await this.runPromotionCore(tx, input);

    // Achado da 3ª rodada de auditoria adversarial: CvTalentCaptureService#
    // deriveCurrentTitle só roda no instante da extração (CvProcessingWorker#
    // processJob) — uma promoção EXPLÍCITA posterior (resumes.service.ts#
    // setPrimary, ou claim via ClaimSourceGrantService, ambos entram por
    // aqui) nunca re-executa aquela lógica, então currentTitle ficava
    // parado no valor da extração original mesmo depois do Master mudar de
    // verdade. currentTitle é um FATO CONSOLIDADO gravado em cada evento
    // que confirma quem é o Master (nunca uma projeção "ao vivo" recalculada
    // por leitura) — por isso esta atualização acontece aqui, no evento de
    // promoção, e não como uma consulta derivada em tempo real. Roda pra
    // USER e GUEST (diferente do sync de UserProfile abaixo, que é só
    // USER) — TalentProfile existe pros dois.
    if (promotion.changed && input.canonicalProfile?.headline?.trim()) {
      await tx.talentProfile.updateMany({
        where:
          input.ownerType === "USER"
            ? { userId: input.userId }
            : { talentSubjectId: input.talentSubjectId },
        data: { currentTitle: input.canonicalProfile.headline.trim() },
      });
    }

    let monitorProjectionJobId: string | null = null;

    // MonitorProjectionJob.userId é obrigatório no schema — só faz
    // sentido pra ownerType USER (guest não é monitorado). E só quando
    // o Master de fato mudou nesta passada (seção 17): nunca em toda
    // análise/promoção, nunca em no-op.
    if (promotion.changed && input.ownerType === "USER") {
      if (input.canonicalProfile && input.cvSourceId) {
        await this.userProfileSync.syncWithinTransaction(tx, {
          userId: input.userId,
          canonicalProfile: input.canonicalProfile,
          confidence: input.confidence ?? {},
          cvSourceId: input.cvSourceId,
          extractedAt: new Date().toISOString(),
        });
      }

      const job = await tx.monitorProjectionJob.create({
        data: {
          userId: input.userId,
          reason: promotion.reason ?? "MASTER_REPLACED",
        },
      });
      monitorProjectionJobId = job.id;
    }

    return { ...promotion, monitorProjectionJobId };
  }

  private async runPromotionCore(
    tx: Prisma.TransactionClient,
    input: PromoteMasterInput,
  ): Promise<PromoteMasterResult> {
    const result = await this.runPromotionDecision(tx, input);

    // Correção da Fase 3 — flip de Resume.isMaster ATÔMICO com a
    // designação (ver doc do campo syncResumeIsMaster acima). Roda depois
    // de toda a decisão de promoção estar resolvida, mas ainda DENTRO da
    // mesma transação — se o commit falhar (ex.: trigger de subject-match
    // deferred), este flip é revertido junto com tudo o mais.
    if (
      input.syncResumeIsMaster &&
      input.ownerType === "USER" &&
      input.resumeId &&
      result.activeDesignation.cvStructuredProfileId ===
        input.cvStructuredProfileId
    ) {
      await tx.resume.updateMany({
        where: { userId: input.userId, NOT: { id: input.resumeId } },
        data: { isMaster: false },
      });
      await tx.resume.update({
        where: { id: input.resumeId },
        data: { isMaster: true, kind: ResumeKind.master },
      });

      // Achado escrevendo os testes da Fase 3C (Tarefa 2, cenário "mesmo
      // conteúdo/hash reenviado"): quando o mesmo texto é reenviado como um
      // Resume NOVO (ex.: reupload do mesmo arquivo), runPromotionDecision
      // acima trata como idempotente — mesmo CvStructuredProfile, então
      // "changed: false" — e retorna a designação EXISTENTE sem tocar
      // resumeId. Sem este ajuste, o flip de isMaster acima ainda promove
      // corretamente o Resume novo (é o resumeId pedido por ESTA chamada,
      // não o da designação antiga), mas CvMasterDesignation.resumeId
      // continuava apontando pro Resume ANTIGO — que acabou de ser
      // demovido dois passos acima. Isso violava a invariante formal
      // (schema.prisma#CvMasterDesignation): "o Resume da designação ativa
      // é EXATAMENTE o que tem isMaster=true". Corrige realinhando
      // resumeId na mesma linha ativa, na MESMA transação do flip —
      // idempotente (nunca cria uma nova designação, só corrige o
      // ponteiro quando ele diverge do resumeId desta chamada).
      if (result.activeDesignation.resumeId !== input.resumeId) {
        result.activeDesignation = await tx.cvMasterDesignation.update({
          where: { id: result.activeDesignation.id },
          data: { resumeId: input.resumeId },
        });
      }
    }

    return result;
  }

  private async runPromotionDecision(
    tx: Prisma.TransactionClient,
    input: PromoteMasterInput,
  ): Promise<PromoteMasterResult> {
    {
      const ownerColumn: "userId" | "talentSubjectId" =
        input.ownerType === "USER" ? "userId" : "talentSubjectId";
      const ownerValue =
        input.ownerType === "USER" ? input.userId : input.talentSubjectId;

      // Serialização por dono via advisory lock transacional (liberado
      // automaticamente no commit/rollback), em vez de um SELECT ... FOR
      // UPDATE literal sobre a linha ativa. Desvio deliberado do texto da
      // seção 10 do plano, documentado no relatório da Fase 2: um
      // SELECT ... FOR UPDATE que bloqueia numa linha e a transação
      // concorrente SUPERSEDE essa linha (UPDATE) e INSERE uma linha nova
      // como ativa — quando a bloqueada finalmente desbloqueia, o Postgres
      // (EvalPlanQual, READ COMMITTED) reavalia só a linha original contra
      // a condição da query; como ela deixou de casar (supersededAt não é
      // mais NULL), a linha simplesmente some do resultado — a nova linha
      // ativa (INSERT, não UPDATE da mesma tupla) NUNCA é redescoberta pela
      // mesma instrução bloqueada. Isso faria a segunda transação enxergar
      // "nenhuma designação ativa" e tentar um INSERT que colide no índice
      // único parcial, quando deveria enxergar a ativa real e supersedê-la.
      // pg_advisory_xact_lock preserva a mesma garantia pretendida (só uma
      // promoção por dono em voo por vez; quem trava por último processa
      // e comita por último) com leitura correta do estado real após
      // desbloquear.
      const lockKey = `cv-master-designation:${ownerColumn}:${ownerValue}`;
      // $executeRaw, não $queryRaw: pg_advisory_xact_lock retorna void, e o
      // deserializador de $queryRaw do Prisma não sabe mapear uma coluna
      // `void` pra nenhum tipo suportado (falha em runtime — achado
      // escrevendo os testes desta Fase 2, corrigido aqui). $executeRaw só
      // reporta linhas afetadas, nunca tenta deserializar o resultado.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const activeWhere =
        input.ownerType === "USER"
          ? { userId: input.userId, supersededAt: null }
          : { talentSubjectId: input.talentSubjectId, supersededAt: null };

      const active = await tx.cvMasterDesignation.findFirst({
        where: activeWhere,
      });

      if (!active) {
        // Ninguém ativo ainda — PROMOTE_IF_FIRST e PROMOTE_EXPLICIT se
        // comportam igual aqui: tenta criar. Se perder a corrida do INSERT
        // (unique parcial), reconsulta e retorna a vencedora como no-op.
        try {
          const created = await tx.cvMasterDesignation.create({
            data: {
              ownerType: input.ownerType as CvSourceOwnerType,
              userId: input.ownerType === "USER" ? input.userId : null,
              talentSubjectId:
                input.ownerType === "GUEST" ? input.talentSubjectId : null,
              cvStructuredProfileId: input.cvStructuredProfileId,
              resumeId: input.resumeId ?? null,
              promotedReason: input.promotedReason,
            },
          });
          return {
            changed: true,
            reason: "MASTER_CREATED" as const,
            activeDesignation: created,
          };
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;

          const winner = await tx.cvMasterDesignation.findFirstOrThrow({
            where: { [ownerColumn]: ownerValue, supersededAt: null },
          });
          return {
            changed: false,
            reason: null,
            activeDesignation: winner,
          };
        }
      }

      if (active.cvStructuredProfileId === input.cvStructuredProfileId) {
        // Já é o Master ativo — idempotente, no-op.
        return { changed: false, reason: null, activeDesignation: active };
      }

      if (input.masterIntent === "PROMOTE_IF_FIRST") {
        // Já existe designação ativa — PROMOTE_IF_FIRST nunca substitui.
        return { changed: false, reason: null, activeDesignation: active };
      }

      // PROMOTE_EXPLICIT com designação ativa preexistente: supersede a
      // atual e insere a nova como ativa. A trigger de subject-match
      // (DEFERRABLE INITIALLY DEFERRED) valida no commit, não aqui.
      await tx.cvMasterDesignation.update({
        where: { id: active.id },
        data: { supersededAt: new Date() },
      });

      const created = await tx.cvMasterDesignation.create({
        data: {
          ownerType: input.ownerType as CvSourceOwnerType,
          userId: input.ownerType === "USER" ? input.userId : null,
          talentSubjectId:
            input.ownerType === "GUEST" ? input.talentSubjectId : null,
          cvStructuredProfileId: input.cvStructuredProfileId,
          resumeId: input.resumeId ?? null,
          promotedReason: input.promotedReason,
        },
      });

      return {
        changed: true,
        reason: "MASTER_REPLACED" as const,
        activeDesignation: created,
      };
    }
  }

  // Correção Fase 3C item 4 (exclusão do Master, resumes.service.ts#remove) —
  // chamado DENTRO da mesma transação Prisma que apaga o Resume. Reusa
  // exatamente o mesmo advisory lock (mesmo lockKey) de
  // runPromotionDecision — serializa com qualquer PROMOTE_EXPLICIT/
  // PROMOTE_IF_FIRST concorrente pro mesmo usuário, então nunca corre o
  // risco de supersedir uma designação que uma promoção concorrente acabou
  // de tornar obsoleta (ou vice-versa: promover em cima de uma designação
  // que está sendo supersedida por esta exclusão).
  //
  // Se a designação ativa do usuário aponta exatamente pro `resumeId`
  // sendo excluído, supersede-a e retorna a linha atualizada. Caso
  // contrário (não há designação ativa, ou ela aponta pra outro Resume —
  // ex.: o Resume excluído não é/não é mais o Master real, só tem
  // Resume.isMaster desatualizado) é no-op (retorna null): excluir um
  // Resume comum nunca mexe em CvMasterDesignation, e nunca promove outro
  // Resume automaticamente (fora de escopo desta correção, por design).
  async supersedeIfResumeMatches(
    tx: Prisma.TransactionClient,
    userId: string,
    resumeId: string,
  ): Promise<CvMasterDesignation | null> {
    const lockKey = `cv-master-designation:userId:${userId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

    const active = await tx.cvMasterDesignation.findFirst({
      where: { userId, supersededAt: null },
    });

    if (!active || active.resumeId !== resumeId) {
      return null;
    }

    return tx.cvMasterDesignation.update({
      where: { id: active.id },
      data: { supersededAt: new Date() },
    });
  }

  async getActiveDesignation(
    owner: MasterOwnerRef,
  ): Promise<CvMasterDesignation | null> {
    if (owner.ownerType === "USER") {
      return this.database.cvMasterDesignation.findFirst({
        where: { userId: owner.userId, supersededAt: null },
      });
    }
    return this.database.cvMasterDesignation.findFirst({
      where: { talentSubjectId: owner.talentSubjectId, supersededAt: null },
    });
  }
}
