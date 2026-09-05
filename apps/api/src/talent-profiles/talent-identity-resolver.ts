import type {
  PrismaClient,
  TalentDataProvenance,
  TalentIdentityConfidence,
  TalentIdentitySignalType,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

// Resolução/deduplicação de identidade — fase 1 da Base de Talentos (ver
// AGENTS.md "v3.2"). Regra de merge:
//
//   - userId é definitivo: um TalentProfile.userId nunca é sobrescrito por
//     outro userId.
//   - Sinais STRONG (EMAIL/PHONE/LINKEDIN) concordantes -> merge automático
//     (attach a um profile já existente, ou promove um profile GUEST_ONLY
//     para CONFIRMED_USER quando um usuário cadastrado bate com um sinal já
//     visto em análise anônima anterior).
//   - Sinais STRONG conflitantes (mesmo tipo de sinal apontando pra um
//     profile diferente do já resolvido) -> nunca funde, gera
//     TalentIdentityConflict pra revisão humana.
//   - NAME_COMPOSITE nunca aciona merge automático, sozinho ou combinado.
//
// textSha256/professionalProfileFingerprint do AnalysisCvSnapshot nunca são
// usados aqui — são hash de conteúdo/documento, não de pessoa.

// Ordem de prioridade pra decidir qual sinal resolve a identidade primeiro
// quando um candidato tem mais de um extraído do mesmo texto.
const STRONG_SIGNAL_PRIORITY: TalentIdentitySignalType[] = [
  "EMAIL",
  "PHONE",
  "LINKEDIN",
];

export type CandidateSignal = {
  signalType: TalentIdentitySignalType;
  normalizedValue: string;
  confidence: TalentIdentityConfidence;
  provenance: TalentDataProvenance;
  sourceRecordType: string;
  sourceRecordId: string;
};

export type ResolutionOutcome = {
  talentProfileId: string;
  createdProfile: boolean;
  promotedToUser: boolean;
  attachedSignals: number;
  conflicts: number;
};

// resolveForGuest só — sinaliza pro chamador que o profile ao qual esta
// chamada acabou de anexar sinais é um TalentProfile LEGADO sem NENHUM
// dono (userId/talentSubjectId nulos, das 187 linhas pré-migration
// 20260904222812). A adoção em si (UPDATE + auditoria) NÃO acontece aqui —
// fica a cargo do chamador via
// TalentSubjectService#adoptLegacyOwnerlessProfile, que é o único lugar
// que sabe gravar TalentSubjectMergeEvent sem duplicar.
export type GuestResolutionOutcome = ResolutionOutcome & {
  requiresLegacyAdoption: boolean;
};

type PendingConflict = {
  otherProfileId: string;
  signal: CandidateSignal;
};

type PrismaLike = Pick<
  PrismaClient,
  | "talentProfile"
  | "talentIdentitySignal"
  | "talentIdentityConflict"
  | "talentSubjectMergeEvent"
>;

export class TalentIdentityResolver {
  constructor(
    private readonly prisma: PrismaLike,
    private readonly dryRun: boolean,
  ) {}

  // Resolve o profile de um usuário cadastrado. Se um sinal forte já
  // aponta pra um profile GUEST_ONLY existente, promove esse profile (seta
  // userId) em vez de criar um novo — é o que garante que um guest que
  // depois se cadastra mantém a mesma identidade.
  async resolveForUser(
    userId: string,
    signals: CandidateSignal[],
  ): Promise<ResolutionOutcome> {
    const existing = await this.prisma.talentProfile.findUnique({
      where: { userId },
    });
    if (existing) {
      const attached = await this.attachSignals(existing.id, signals);
      return this.toOutcome(existing.id, false, false, attached);
    }

    // Só decide QUAL profile é o alvo (promover um guest existente, ou
    // criar um novo) — conflito por sinal é responsabilidade única de
    // attachSignals abaixo, pra não logar o mesmo conflito duas vezes.
    let promotedProfileId: string | null = null;
    let promotedFromTalentSubjectId: string | null = null;
    for (const signal of this.orderedStrongSignals(signals)) {
      const match = await this.findSignalOwner(signal);
      if (match?.userId === null) {
        promotedProfileId = match.id;
        promotedFromTalentSubjectId = match.talentSubjectId;
        break;
      }
    }

    if (promotedProfileId) {
      if (!this.dryRun) {
        // Correção da migration 20260904222812/talent_profile_owner_xor: um
        // guest resolvido pelo caminho novo (Fase 2F-corretiva) já tem
        // talentSubjectId preenchido. Promover pra CONFIRMED_USER exige
        // limpar talentSubjectId (dono é exatamente um, nunca os dois) —
        // grava a auditoria formal do merge sujeito→usuário (mesmo padrão
        // do plano, seção 3: sinal STRONG concordante -> merge automático
        // com evento).
        await this.prisma.talentProfile.update({
          where: { id: promotedProfileId },
          data: {
            userId,
            identityConfidence: "CONFIRMED_USER",
            talentSubjectId: null,
          },
        });
        if (promotedFromTalentSubjectId) {
          await this.prisma.talentSubjectMergeEvent.create({
            data: {
              talentSubjectId: promotedFromTalentSubjectId,
              targetUserId: userId,
              reason: "STRONG_SIGNAL_MATCH",
            },
          });
        }
      }
      const attached = await this.attachSignals(promotedProfileId, signals);
      return this.toOutcome(promotedProfileId, false, true, attached);
    }

    const profileId = this.dryRun
      ? `dry-run-user-${userId}`
      : (
          await this.prisma.talentProfile.create({
            data: {
              userId,
              identityConfidence: "CONFIRMED_USER",
              ...this.originFields(signals),
            },
          })
        ).id;

    const attached = await this.attachSignals(profileId, signals);

    return this.toOutcome(profileId, true, false, attached);
  }

  // Resolve o profile de uma análise anônima (guest). Se achar um sinal
  // forte que já bate com QUALQUER profile existente — guest ou já
  // registrado — anexa nele. Nunca cria/funde a partir de NAME_COMPOSITE
  // sozinho.
  //
  // `talentSubjectId` (correção da migration 20260904222812 — ver
  // talent-subject.service.ts#resolveOrCreateAnonymousSubject): todo
  // TalentProfile NOVO criado aqui precisa de exatamente um dono
  // (talent_profile_requires_owner). O chamador resolve/cria o
  // TalentSubject ANTES de chamar este método (sempre disponível, mesmo
  // sem guestSessionHash) e passa o id aqui — usado só quando este método
  // efetivamente cria uma linha nova. Quando em vez disso ele encontra um
  // profile LEGADO sem dono por match de sinal, este método só sinaliza
  // (`requiresLegacyAdoption`) — a adoção de fato é feita pelo chamador via
  // TalentSubjectService, reusando este mesmo talentSubjectId.
  async resolveForGuest(
    signals: CandidateSignal[],
    talentSubjectId: string,
  ): Promise<GuestResolutionOutcome> {
    // Mesma lógica de resolveForUser: só decide o profile alvo aqui,
    // conflito por sinal é sempre responsabilidade de attachSignals.
    let resolvedProfileId: string | null = null;
    let requiresLegacyAdoption = false;
    for (const signal of this.orderedStrongSignals(signals)) {
      const match = await this.findSignalOwner(signal);
      if (match) {
        resolvedProfileId = match.id;
        requiresLegacyAdoption = !match.userId && !match.talentSubjectId;
        break;
      }
    }

    if (resolvedProfileId) {
      const attached = await this.attachSignals(resolvedProfileId, signals);
      return {
        ...this.toOutcome(resolvedProfileId, false, false, attached),
        requiresLegacyAdoption: requiresLegacyAdoption && !this.dryRun,
      };
    }

    const hasStrongSignal = this.orderedStrongSignals(signals).length > 0;
    const identityConfidence: TalentIdentityConfidence = hasStrongSignal
      ? "STRONG_MATCH"
      : "UNVERIFIED";

    const { id: profileId, created } = this.dryRun
      ? {
          id: `dry-run-guest-${signals[0]?.sourceRecordId ?? "unknown"}`,
          created: true,
        }
      : await this.createOrReuseByTalentSubject(
          talentSubjectId,
          identityConfidence,
          signals,
        );

    const attached = await this.attachSignals(profileId, signals);

    return {
      ...this.toOutcome(profileId, created, false, attached),
      requiresLegacyAdoption: false,
    };
  }

  // Todo sinal de uma mesma chamada vem do MESMO registro de origem (um
  // CV/análise) — basta o primeiro. Gravado uma vez na criação,
  // independente de o sinal em si sobreviver ou colidir com outro profile
  // (ver comentário do campo no schema).
  // Concorrência real: duas capturas do MESMO guest (mesmo talentSubjectId,
  // vindo da mesma sessão resolvida por TalentSubjectService) sem nenhum
  // profile existente ainda podem chegar aqui ao mesmo tempo — nenhuma
  // delas encontra o profile via findSignalOwner (não há sinal ainda), as
  // duas tentam criar. TalentProfile.talentSubjectId é @unique, então a
  // perdedora recebe P2002 — mesmo padrão create+catch(P2002)+reread já
  // usado em talent-subject.service.ts#resolveForGuestSession, aqui
  // aplicado ao TalentProfile em vez do TalentSubject.
  private async createOrReuseByTalentSubject(
    talentSubjectId: string,
    identityConfidence: TalentIdentityConfidence,
    signals: CandidateSignal[],
  ): Promise<{ id: string; created: boolean }> {
    try {
      const created = await this.prisma.talentProfile.create({
        data: {
          identityConfidence,
          talentSubjectId,
          ...this.originFields(signals),
        },
      });
      return { id: created.id, created: true };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      const winner = await this.prisma.talentProfile.findUniqueOrThrow({
        where: { talentSubjectId },
      });
      return { id: winner.id, created: false };
    }
  }

  private originFields(signals: CandidateSignal[]) {
    const origin = signals[0];
    if (!origin) return {};
    return {
      originSourceRecordType: origin.sourceRecordType,
      originSourceRecordId: origin.sourceRecordId,
    };
  }

  private toOutcome(
    talentProfileId: string,
    createdProfile: boolean,
    promotedToUser: boolean,
    attached: { attached: number; conflicts: number },
  ): ResolutionOutcome {
    return {
      talentProfileId,
      createdProfile,
      promotedToUser,
      attachedSignals: attached.attached,
      conflicts: attached.conflicts,
    };
  }

  private orderedStrongSignals(signals: CandidateSignal[]): CandidateSignal[] {
    return STRONG_SIGNAL_PRIORITY.flatMap((type) =>
      signals.filter((signal) => signal.signalType === type),
    );
  }

  private async findSignalOwner(signal: CandidateSignal): Promise<{
    id: string;
    userId: string | null;
    talentSubjectId: string | null;
  } | null> {
    const match = await this.prisma.talentIdentitySignal.findUnique({
      where: {
        signalType_normalizedValue: {
          signalType: signal.signalType,
          normalizedValue: signal.normalizedValue,
        },
      },
    });
    if (!match) return null;

    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: match.talentProfileId },
    });
    return profile
      ? {
          id: profile.id,
          userId: profile.userId,
          talentSubjectId: profile.talentSubjectId,
        }
      : null;
  }

  private async attachSignals(
    talentProfileId: string,
    signals: CandidateSignal[],
  ): Promise<{ attached: number; conflicts: number }> {
    let attached = 0;
    const pendingConflicts: PendingConflict[] = [];

    for (const signal of signals) {
      const existing = await this.prisma.talentIdentitySignal.findUnique({
        where: {
          signalType_normalizedValue: {
            signalType: signal.signalType,
            normalizedValue: signal.normalizedValue,
          },
        },
      });

      if (!existing) {
        if (!this.dryRun) {
          await this.prisma.talentIdentitySignal.create({
            data: { talentProfileId, ...signal },
          });
        }
        attached += 1;
        continue;
      }

      if (existing.talentProfileId === talentProfileId) {
        continue;
      }

      // Sinal já pertence a outro profile — nunca sobrescreve
      // silenciosamente (regra de merge conflitante). NAME_COMPOSITE nunca
      // gera conflito registrado, só é ignorado.
      if (signal.signalType !== "NAME_COMPOSITE") {
        pendingConflicts.push({
          otherProfileId: existing.talentProfileId,
          signal,
        });
      }
    }

    const conflicts = await this.flushConflicts(
      talentProfileId,
      pendingConflicts,
    );
    return { attached, conflicts };
  }

  private async flushConflicts(
    profileId: string,
    pending: PendingConflict[],
  ): Promise<number> {
    if (pending.length === 0) return 0;
    if (this.dryRun) return pending.length;

    let count = 0;
    for (const { otherProfileId, signal } of pending) {
      if (otherProfileId === profileId) continue;

      // Reprocessar o mesmo par (ex: reexecução do backfill depois de uma
      // interrupção) não pode logar o mesmo conflito de novo — sem isso,
      // toda vez que os dois profiles ainda existirem separados o
      // conflito reaparece duplicado.
      const alreadyLogged = await this.prisma.talentIdentityConflict.findFirst({
        where: {
          profileAId: otherProfileId,
          profileBId: profileId,
          signalType: signal.signalType,
          resolvedAt: null,
        },
      });
      if (alreadyLogged) continue;

      await this.prisma.talentIdentityConflict.create({
        data: {
          profileAId: otherProfileId,
          profileBId: profileId,
          signalType: signal.signalType,
          profileAValue: signal.normalizedValue,
          profileBValue: signal.normalizedValue,
        },
      });
      count += 1;
    }
    return count;
  }
}
