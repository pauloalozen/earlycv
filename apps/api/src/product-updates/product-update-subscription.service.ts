import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";

export type EligibleRecipient = {
  userId: string;
  email: string;
  name: string;
};

// where compartilhado por resolveEligibleRecipients/countEligibleRecipients
// — nunca duas implementações que poderiam divergir. status=active exclui
// conta pendente/suspensa/excluída (nunca faz sentido mandar comunicado
// institucional pra essas); ausência de ProductEmailSubscription conta
// como elegível (default opt-in, mesmo raciocínio do
// MonitorAlertPreference — quem nunca decidiu nada está optado, descadastro
// é ação explícita feita pelo próprio SES, ver §4 do plano).
function eligibilityWhere(
  audience: "INTERNAL_TEST" | "ALL_ELIGIBLE_USERS",
): Prisma.UserWhereInput {
  const notOptedOut: Prisma.UserWhereInput = {
    OR: [
      { productEmailSubscription: null },
      { productEmailSubscription: { subscribed: true } },
    ],
  };

  if (audience === "INTERNAL_TEST") {
    return {
      status: "active",
      internalRole: { in: ["admin", "superadmin"] },
      AND: [notOptedOut],
    };
  }

  return {
    status: "active",
    AND: [notOptedOut],
  };
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
    audience: "INTERNAL_TEST" | "ALL_ELIGIBLE_USERS",
  ): Promise<number> {
    return this.database.user.count({ where: eligibilityWhere(audience) });
  }

  async resolveEligibleRecipients(
    audience: "INTERNAL_TEST" | "ALL_ELIGIBLE_USERS",
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
