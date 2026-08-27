import { randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { possessionTokenMatchesHash } from "../common/guest-possession-token";
import { isValidJourneySessionInternalId } from "../common/journey-session-id";
import { isValidVisitorId } from "../common/visitor-id";
import { DatabaseService } from "../database/database.service";
import { SIGNUP_CONVERSION_CONTEXTS } from "./dto/register.dto";

const OAUTH_ATTEMPT_TTL_MS = 10 * 60 * 1000; // mesma janela dos cookies oauth_* existentes

export type CreateOAuthAttemptInput = {
  jobId: string;
  guestPossessionToken: string;
  conversionContext?: string;
  journeySessionInternalId?: string;
  visitorId?: string;
};

export type ResolvedOAuthAttempt = {
  analysisJobId: string;
  conversionContext: string | null;
  journeySessionInternalId: string | null;
  visitorId: string | null;
};

// state é gerado exclusivamente aqui, no backend — o navegador nunca
// escolhe/influencia o valor. Devolvido pelo Google atrelado unicamente à
// requisição de autorização que o originou, imune a sobrescrita por outra
// aba (ao contrário dos cookies oauth_signup_ctx/oauth_journey_sid/
// oauth_visitor_id, que são globais ao navegador). Ver
// specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md
// seção 4.1.
@Injectable()
export class OAuthAttemptService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async create(input: CreateOAuthAttemptInput): Promise<{ state: string }> {
    const job = await this.database.analysisJob.findUnique({
      where: { id: input.jobId },
      select: {
        ownerKind: true,
        guestPossessionTokenHash: true,
        convertedAt: true,
      },
    });

    if (
      !job ||
      job.ownerKind !== "guest" ||
      !job.guestPossessionTokenHash ||
      job.convertedAt
    ) {
      throw new UnauthorizedException("invalid guest analysis reference");
    }

    if (
      !possessionTokenMatchesHash(
        input.guestPossessionToken,
        job.guestPossessionTokenHash,
      )
    ) {
      throw new UnauthorizedException("invalid guest analysis reference");
    }

    const state = randomBytes(32).toString("hex");

    await this.database.oAuthAttempt.create({
      data: {
        state,
        analysisJobId: input.jobId,
        conversionContext: this.normalizeConversionContext(
          input.conversionContext,
        ),
        journeySessionInternalId: isValidJourneySessionInternalId(
          input.journeySessionInternalId,
        )
          ? input.journeySessionInternalId
          : null,
        visitorId: isValidVisitorId(input.visitorId) ? input.visitorId : null,
        expiresAt: new Date(Date.now() + OAUTH_ATTEMPT_TTL_MS),
      },
    });

    return { state };
  }

  // Compare-and-swap atômico via updateMany: só uma chamada concorrente
  // consegue casar `consumedAt: null` e setar consumedAt — a segunda
  // (replay, callback duplicado, ou tentativa de reaproveitar um state já
  // usado) sempre recebe count === 0. Não precisa de transação/lock
  // explícito, o próprio UPDATE do Postgres serializa isso.
  async resolveAndConsume(state: string): Promise<ResolvedOAuthAttempt | null> {
    if (!state) return null;

    const consumed = await this.database.oAuthAttempt.updateMany({
      where: {
        state,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { consumedAt: new Date() },
    });

    if (consumed.count !== 1) {
      return null;
    }

    const attempt = await this.database.oAuthAttempt.findUnique({
      where: { state },
      select: {
        analysisJobId: true,
        conversionContext: true,
        journeySessionInternalId: true,
        visitorId: true,
      },
    });

    if (!attempt) return null;

    return attempt;
  }

  // Transferência de posse do AnalysisJob guest para o usuário recém-
  // autenticado — a ÚNICA porta pela qual isso pode acontecer, porque só
  // aqui a correlação já foi provada criptograficamente (possession token
  // verificado na criação do OAuthAttempt + state amarrado àquela tentativa
  // específica). Nenhum outro endpoint aceita um jobId "solto" para
  // transferir ownership. Idempotente: só atualiza se o job ainda não tem
  // dono (userId null) ou já pertence a este mesmo usuário (retry seguro);
  // nunca sobrescreve um dono diferente.
  async transferAnalysisJobOwnership(
    analysisJobId: string,
    userId: string,
  ): Promise<void> {
    await this.database.analysisJob.updateMany({
      where: {
        id: analysisJobId,
        ownerKind: "guest",
        OR: [{ userId: null }, { userId }],
      },
      data: { userId },
    });
  }

  private normalizeConversionContext(value: string | undefined) {
    return value &&
      (SIGNUP_CONVERSION_CONTEXTS as readonly string[]).includes(value)
      ? value
      : null;
  }
}
