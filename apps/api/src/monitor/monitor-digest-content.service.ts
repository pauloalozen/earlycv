import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

// Teto de recomendações por digest — reduzido de 30 pra 5 (decisão de
// produto: e-mail diário poluído com 30 vagas). O que passa do teto não é
// perdido: continua elegível (digestInclusions vazio) pro próximo digest,
// e o usuário sempre vê a fila inteira dentro do produto (GET /monitor),
// não só o que já foi mandado por e-mail.
export const MAX_RECOMMENDATIONS_PER_DIGEST = 5;

@Injectable()
export class MonitorDigestContentService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // "Novas/relevantes ainda não incluídas em digest anterior" — critério
  // único e suficiente: ativa (não dismissed, não superseded) E nunca
  // esteve em nenhum MonitorDigestRecommendation antes (digestInclusions
  // vazio). Não filtra por janela de tempo (createdAt/recommendedAt) de
  // propósito: uma recomendação que surgiu entre duas execuções do
  // scheduler nunca é perdida, e o critério de idempotência já garante que
  // nada é reenviado — ver monitor-digest.scheduler.ts.
  //
  // Ordem: maior aderência primeiro (opportunityLevel desc) — com o teto
  // caindo pra 5, é preciso ser criterioso e priorizar as vagas que
  // realmente importam, não só as mais recentes; recommendedAt desc só
  // desempata vagas de mesmo nível. Isso vale só pra seleção do e-mail —
  // a fila completa que o usuário vê em GET /monitor continua ordenada
  // por novidade (monitor-recommendations.service.ts), sem mudança ali.
  async getEligibleRecommendations(userId: string) {
    return this.database.userJobRecommendation.findMany({
      where: {
        userId,
        dismissedAt: null,
        supersededAt: null,
        digestInclusions: { none: {} },
      },
      include: { job: { include: { company: true } } },
      orderBy: [{ opportunityLevel: "desc" }, { recommendedAt: "desc" }],
      take: MAX_RECOMMENDATIONS_PER_DIGEST,
    });
  }
}
