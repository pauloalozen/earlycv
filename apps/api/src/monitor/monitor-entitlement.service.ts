import { Injectable } from "@nestjs/common";

// Ponto único de decisão "este usuário pode usar o Meu Monitor" — todo
// endpoint/worker do Monitor consulta ESTE serviço, nunca inspeciona
// User.planType/PlanPurchase/etc diretamente (isso seria espalhar checks
// de plano pelo código, o que a spec da Fase 3.1 pede explicitamente pra
// evitar). Hoje a política é "liberado pra todo usuário autenticado"
// (lançamento) — quando existir monetização de verdade, a troca acontece
// SÓ aqui dentro (ex.: checar User.planType, uma tabela de assinatura, um
// trial, ou uma tabela de override manual), sem tocar nenhum call site,
// que só olha `.allowed`.
//
// Perder entitlement no futuro NUNCA apaga UserJobRecommendation,
// MonitorDigest ou qualquer histórico — os call sites só usam isto pra
// decidir se criam trabalho NOVO (backfill, rematch, matching de vaga
// nova, digest). Dados já existentes continuam intactos e consultáveis
// (ex.: GET /monitor com o guard aplicado deixaria de responder, mas as
// linhas no banco não são tocadas).
export type MonitorEntitlementReason =
  | "launch_access"
  | "manual_override"
  | "trial"
  | "active_subscription"
  | "none";

export type MonitorEntitlementResult = {
  allowed: boolean;
  reason: MonitorEntitlementReason;
};

@Injectable()
export class MonitorEntitlementService {
  async canUseMonitor(_userId: string): Promise<MonitorEntitlementResult> {
    // Política do lançamento: sem cobrança, sem trial, sem override —
    // todo usuário autenticado tem acesso. `_userId` já está na
    // assinatura do método (não usado hoje) para que a implementação
    // futura (ex.: `this.database.user.findUnique(...)`,
    // `this.database.planPurchase.findFirst(...)`) não precise mudar a
    // assinatura nem os call sites.
    return { allowed: true, reason: "launch_access" };
  }

  // Variante em lote — usada onde N usuários precisam ser filtrados de
  // uma vez (ex.: MonitorMatchingWorker decidindo quais
  // UserRadarProfile candidatos a uma vaga nova são elegíveis;
  // MonitorDigestScheduler filtrando as preferências do dia) — evita
  // N chamadas individuais quando a implementação real vier a bater em
  // banco/provider externo.
  async filterEntitledUserIds(userIds: string[]): Promise<Set<string>> {
    return new Set(userIds);
  }
}
