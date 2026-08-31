import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

// Teto de recomendações incluídas por digest — generoso (o pool de
// entrada já é pré-filtrado a nível 3+ pelo Monitor) e limita o custo de
// um usuário com backlog grande acumulado (ex: reativou o Monitor depois
// de muito tempo com o e-mail desligado).
export const MAX_RECOMMENDATIONS_PER_DIGEST = 30;
// Quantas vagas aparecem de fato no corpo do e-mail — o resto só é
// contado ("+N no seu Monitor"), nunca listado, pra manter o e-mail
// enxuto (spec explícita da Fase 3).
export const MAX_RECOMMENDATIONS_IN_BODY = 5;

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
  // Ordem: vaga mais recente primeiro (recommendedAt desc) — regra de
  // negócio explícita, prioridade é a novidade da vaga, não o nível de
  // aderência. opportunityLevel só desempata vagas descobertas juntas.
  async getEligibleRecommendations(userId: string) {
    return this.database.userJobRecommendation.findMany({
      where: {
        userId,
        dismissedAt: null,
        supersededAt: null,
        digestInclusions: { none: {} },
      },
      include: { job: { include: { company: true } } },
      orderBy: [{ recommendedAt: "desc" }, { opportunityLevel: "desc" }],
      take: MAX_RECOMMENDATIONS_PER_DIGEST,
    });
  }
}
