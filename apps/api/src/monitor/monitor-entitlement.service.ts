import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { isJobsGhostModeEnabled } from "../common/jobs-ghost-mode";

// Ponto único de decisão "este usuário pode usar o Meu Monitor" — todo
// endpoint/worker do Monitor consulta ESTE serviço, nunca inspeciona
// User.planType/PlanPurchase/internalRole/etc diretamente (isso seria
// espalhar checks de acesso pelo código, o que a spec da Fase 3.1 pede
// explicitamente pra evitar).
//
// Fase de lançamento ghost mode: enquanto JOBS_GHOST_MODE=true (env do
// serviço @earlycv/api no Railway — fonte de verdade do gate real, a
// cópia do mesmo nome na Vercel só controla visibilidade de menu), só
// internalRole admin/superadmin passam — é como o time valida o fluxo
// completo (matching, digest, e-mail, clique, análise, candidatura) em
// produção sem expor a feature à base. Com JOBS_GHOST_MODE=false, resolve
// fechado (allowed:false) pra quem não é staff — ainda NÃO existe regra
// comercial real (trial/plano/concessão administrativa); quando existir,
// a troca acontece SÓ aqui dentro, sem tocar nenhum call site, que só olha
// `.allowed`.
//
// Perder entitlement no futuro NUNCA apaga UserJobRecommendation,
// MonitorDigest ou qualquer histórico — os call sites só usam isto pra
// decidir se criam trabalho NOVO (backfill, rematch, matching de vaga
// nova, digest). Dados já existentes continuam intactos e consultáveis
// (ex.: GET /monitor com o guard aplicado deixaria de responder, mas as
// linhas no banco não são tocadas).
export type MonitorEntitlementReason =
  | "internal_access"
  | "manual_override"
  | "trial"
  | "active_subscription"
  | "none";

export type MonitorEntitlementResult = {
  allowed: boolean;
  reason: MonitorEntitlementReason;
};

const INTERNAL_ROLES = new Set(["admin", "superadmin"]);

@Injectable()
export class MonitorEntitlementService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async canUseMonitor(userId: string): Promise<MonitorEntitlementResult> {
    if (!isJobsGhostModeEnabled()) {
      // Sem regra comercial real ainda — default fechado, de propósito
      // (nunca "liberado enquanto não decidimos", ver comentário acima).
      return { allowed: false, reason: "none" };
    }

    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { internalRole: true },
    });

    const allowed = Boolean(user && INTERNAL_ROLES.has(user.internalRole));
    return { allowed, reason: allowed ? "internal_access" : "none" };
  }

  // Variante em lote — usada onde N usuários precisam ser filtrados de
  // uma vez (ex.: MonitorMatchingWorker decidindo quais
  // UserRadarProfile candidatos a uma vaga nova são elegíveis;
  // MonitorDigestScheduler filtrando as preferências do dia) — evita
  // N chamadas individuais.
  async filterEntitledUserIds(userIds: string[]): Promise<Set<string>> {
    if (!isJobsGhostModeEnabled() || userIds.length === 0) {
      return new Set();
    }

    const internal = await this.database.user.findMany({
      where: { id: { in: userIds }, internalRole: { in: ["admin", "superadmin"] } },
      select: { id: true },
    });

    return new Set(internal.map((user) => user.id));
  }
}
