import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

// Ponto único de decisão "este usuário pode usar o Meu Monitor" — todo
// endpoint/worker do Monitor consulta ESTE serviço, nunca inspeciona
// User.planType/PlanPurchase/internalRole/etc diretamente (isso seria
// espalhar checks de acesso pelo código, o que a spec da Fase 3.1 pede
// explicitamente pra evitar).
//
// Lançamento pra base inteira (decisão de 2026-09-10, Paulo): a fase de
// ghost mode (só internalRole admin/superadmin, gate via JOBS_GHOST_MODE)
// foi encerrada — ainda NÃO existe regra comercial real (trial/plano/
// concessão administrativa), mas a decisão agora é liberar geral em vez
// de fechado por padrão. JOBS_GHOST_MODE não decide mais acesso aqui —
// só controla visibilidade cosmética de menu no frontend (ver
// isJobsGhostModeEnabled() em apps/web/src/lib/jobs-ghost-mode.ts).
// Quando a regra comercial existir, a troca acontece SÓ aqui dentro, sem
// tocar nenhum call site, que só olha `.allowed`.
//
// Perder entitlement no futuro NUNCA apaga UserJobRecommendation,
// MonitorDigest ou qualquer histórico — os call sites só usam isto pra
// decidir se criam trabalho NOVO (backfill, rematch, matching de vaga
// nova, digest). Dados já existentes continuam intactos e consultáveis
// (ex.: GET /monitor com o guard aplicado deixaria de responder, mas as
// linhas no banco não são tocadas).
export type MonitorEntitlementReason =
  | "internal_access"
  | "open_launch"
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
    const user = await this.database.user.findUnique({
      where: { id: userId },
      select: { internalRole: true },
    });
    if (!user) return { allowed: false, reason: "none" };

    const isInternal = INTERNAL_ROLES.has(user.internalRole);
    return {
      allowed: true,
      reason: isInternal ? "internal_access" : "open_launch",
    };
  }

  // Variante em lote — usada onde N usuários precisam ser filtrados de
  // uma vez (ex.: MonitorMatchingWorker decidindo quais
  // UserRadarProfile candidatos a uma vaga nova são elegíveis;
  // MonitorDigestScheduler filtrando as preferências do dia) — evita
  // N chamadas individuais. Mesma decisão de canUseMonitor: liberado pra
  // base inteira, sem consulta ao banco (confia na lista recebida, que já
  // vem de uma query sobre usuários reais nos call sites acima).
  async filterEntitledUserIds(userIds: string[]): Promise<Set<string>> {
    return new Set(userIds);
  }
}
