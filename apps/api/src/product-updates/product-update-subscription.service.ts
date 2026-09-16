import { Inject, Injectable } from "@nestjs/common";
import type { Prisma, ProductUpdateAudience } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type EligibleRecipient = {
  userId: string;
  email: string;
  name: string;
};

// Único ponto de resolução de "usuário pagante" pra este domínio —
// resolver PRÓPRIO, deliberadamente independente de qualquer preferência
// do Monitor (nunca MonitorAlertPreference/MonitorAlertRolloutPolicy).
// Mesma semântica canônica já usada em 3 lugares do Monitor pra segmento
// PAID (AdminMonitorService.resolveAlertRolloutSegmentUserIds,
// MonitorAlertRolloutReconciler.resolveUnenrolledCandidates,
// MonitorDigestScheduler.resolveCohort — nenhum deles exporta essa lógica
// de forma reaproveitável, por isso replicada aqui como sua própria fonte
// de verdade, não uma dependência do Monitor): pelo menos uma
// PlanPurchase com status "completed". "completed" é o único status do
// enum PaymentStatus que representa uma compra de fato aprovada — pending/
// processing_payment/pending_payment/failed/refunded nunca contam, e uma
// segunda compra completed do mesmo usuário nunca duplica o resultado
// (Prisma `some` é um EXISTS, não um join que multiplica linhas).
const PAID_USER_FILTER: Prisma.UserWhereInput = {
  planPurchases: { some: { status: "completed" } },
};

// where compartilhado por resolveEligibleRecipients/countEligibleRecipients
// — nunca duas implementações que poderiam divergir. status=active exclui
// conta pendente/suspensa/excluída (nunca faz sentido mandar comunicado
// institucional pra essas); ausência de ProductEmailSubscription conta
// como elegível (default opt-in, mesmo raciocínio do
// MonitorAlertPreference — quem nunca decidiu nada está optado, descadastro
// é ação explícita feita pelo próprio SES, ver §4 do plano). O filtro de
// elegibilidade COMUM (status ativo + não suprimido) é aplicado por igual
// aos três públicos — ser INTERNAL_TEST ou PAID nunca ignora descadastro/
// bounce/complaint.
function eligibilityWhere(
  audience: ProductUpdateAudience,
): Prisma.UserWhereInput {
  const notOptedOut: Prisma.UserWhereInput = {
    OR: [
      { productEmailSubscription: null },
      { productEmailSubscription: { subscribed: true } },
    ],
  };

  const base: Prisma.UserWhereInput = {
    status: "active",
    AND: [notOptedOut],
  };

  if (audience === "INTERNAL_TEST") {
    return { ...base, internalRole: { in: ["admin", "superadmin"] } };
  }

  if (audience === "PAID") {
    return { ...base, ...PAID_USER_FILTER };
  }

  return base;
}

// Fonte de verdade LOCAL de elegibilidade — pré-filtro antes de criar
// ProductUpdateDelivery. O SES (ListManagementOptions no envio real) é a
// barreira final independente desta consulta, nunca substituída por ela.
@Injectable()
export class ProductUpdateSubscriptionService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async countEligibleRecipients(
    audience: ProductUpdateAudience,
  ): Promise<number> {
    return this.database.user.count({ where: eligibilityWhere(audience) });
  }

  async resolveEligibleRecipients(
    audience: ProductUpdateAudience,
  ): Promise<EligibleRecipient[]> {
    const users = await this.database.user.findMany({
      where: eligibilityWhere(audience),
      select: { id: true, email: true, name: true },
    });
    return users.map((user) => ({
      userId: user.id,
      email: user.email,
      name: user.name,
    }));
  }

  // Chamado pelo webhook (bounce/complaint/SUBSCRIPTION) — nunca pelo fluxo
  // de unsubscribe do usuário (não existe: descadastro é só pelo SES, ver
  // §4 do plano). Idempotente: upsert, nunca lança se já estava
  // desativado.
  async markSuppressed(
    userId: string,
    reason: "BOUNCED" | "COMPLAINED" | "SES_OPT_OUT",
    occurredAt: Date,
  ): Promise<void> {
    await this.database.productEmailSubscription.upsert({
      where: { userId },
      create: {
        userId,
        subscribed: false,
        unsubscribedAt: occurredAt,
        suppressionReason: reason,
      },
      update: {
        subscribed: false,
        unsubscribedAt: occurredAt,
        suppressionReason: reason,
      },
    });
  }

  // SUBSCRIPTION com topicSubscriptionStatus=OPT_IN reverte uma supressão
  // anterior (ex.: usuário se descadastrou e depois se re-inscreveu pelo
  // próprio SES) — nunca usado por bounce/complaint (esses só suprimem).
  async markResubscribed(userId: string): Promise<void> {
    await this.database.productEmailSubscription.upsert({
      where: { userId },
      create: { userId, subscribed: true },
      update: {
        subscribed: true,
        unsubscribedAt: null,
        suppressionReason: null,
      },
    });
  }

  async findUserIdByEmail(email: string): Promise<string | null> {
    const user = await this.database.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id ?? null;
  }
}
