import type {
  PrismaClient,
  TalentDataProvenance,
  TalentIdentityConfidence,
  TalentIdentitySignalType,
} from "@prisma/client";

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

type PendingConflict = {
  otherProfileId: string;
  signal: CandidateSignal;
};

type PrismaLike = Pick<
  PrismaClient,
  "talentProfile" | "talentIdentitySignal" | "talentIdentityConflict"
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
    for (const signal of this.orderedStrongSignals(signals)) {
      const match = await this.findSignalOwner(signal);
      if (match?.userId === null) {
        promotedProfileId = match.id;
        break;
      }
    }

    if (promotedProfileId) {
      if (!this.dryRun) {
        await this.prisma.talentProfile.update({
          where: { id: promotedProfileId },
          data: { userId, identityConfidence: "CONFIRMED_USER" },
        });
      }
      const attached = await this.attachSignals(promotedProfileId, signals);
      return this.toOutcome(promotedProfileId, false, true, attached);
    }

    const profileId = this.dryRun
      ? `dry-run-user-${userId}`
      : (
          await this.prisma.talentProfile.create({
            data: { userId, identityConfidence: "CONFIRMED_USER" },
          })
        ).id;

    const attached = await this.attachSignals(profileId, signals);

    return this.toOutcome(profileId, true, false, attached);
  }

  // Resolve o profile de uma análise anônima (guest). Se achar um sinal
  // forte que já bate com QUALQUER profile existente — guest ou já
  // registrado — anexa nele. Nunca cria/funde a partir de NAME_COMPOSITE
  // sozinho.
  async resolveForGuest(
    signals: CandidateSignal[],
  ): Promise<ResolutionOutcome> {
    // Mesma lógica de resolveForUser: só decide o profile alvo aqui,
    // conflito por sinal é sempre responsabilidade de attachSignals.
    let resolvedProfileId: string | null = null;
    for (const signal of this.orderedStrongSignals(signals)) {
      const match = await this.findSignalOwner(signal);
      if (match) {
        resolvedProfileId = match.id;
        break;
      }
    }

    if (resolvedProfileId) {
      const attached = await this.attachSignals(resolvedProfileId, signals);
      return this.toOutcome(resolvedProfileId, false, false, attached);
    }

    const hasStrongSignal = this.orderedStrongSignals(signals).length > 0;
    const identityConfidence: TalentIdentityConfidence = hasStrongSignal
      ? "STRONG_MATCH"
      : "UNVERIFIED";

    const profileId = this.dryRun
      ? `dry-run-guest-${signals[0]?.sourceRecordId ?? "unknown"}`
      : (
          await this.prisma.talentProfile.create({
            data: { identityConfidence },
          })
        ).id;

    const attached = await this.attachSignals(profileId, signals);

    return this.toOutcome(profileId, true, false, attached);
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

  private async findSignalOwner(
    signal: CandidateSignal,
  ): Promise<{ id: string; userId: string | null } | null> {
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
    return profile ? { id: profile.id, userId: profile.userId } : null;
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
