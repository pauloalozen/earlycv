import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import MercadoPagoConfig, { Payment } from "mercadopago";
import { DatabaseService } from "../database/database.service";
import { PlansService } from "../plans/plans.service";

type CheckoutStatus = "pending" | "approved" | "failed";
type NextAction =
  | "show_success"
  | "keep_waiting"
  | "show_failure"
  | "retry_payment";

export type CheckoutStatusResponse = {
  checkoutId: string;
  status: CheckoutStatus;
  nextAction: NextAction;
  type: "plan" | "adaptation";
  planPurchased: string | null;
  planName: string | null;
  creditsGranted: number | null;
  analysisCreditsGranted: number | null;
  adaptationId: string | null;
  paymentId: string | null;
  message: string;
};

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(PlansService) private readonly plansService: PlansService,
  ) {}

  async getCheckoutStatus(
    userId: string,
    checkoutId: string,
  ): Promise<CheckoutStatusResponse> {
    const purchase = await this.database.planPurchase.findFirst({
      where: { id: checkoutId, userId },
    });

    if (purchase) {
      const status = mapPaymentStatus(purchase.status);
      const nextAction = mapNextAction(status);
      return {
        checkoutId,
        status,
        nextAction,
        type: "plan",
        planPurchased: purchase.planType,
        planName: planTypeToName(purchase.planType),
        creditsGranted: purchase.creditsGranted,
        analysisCreditsGranted: purchase.analysisCreditsGranted,
        adaptationId: null,
        paymentId: purchase.mpPaymentId ?? null,
        message: buildMessage(status, "plan"),
      };
    }

    const adaptation = await this.database.cvAdaptation.findFirst({
      where: { id: checkoutId, userId },
    });

    if (!adaptation) {
      throw new NotFoundException("Checkout não encontrado.");
    }

    const status = mapPaymentStatus(adaptation.paymentStatus);
    const nextAction = mapNextAction(status);
    return {
      checkoutId,
      status,
      nextAction,
      type: "adaptation",
      planPurchased: null,
      planName: null,
      creditsGranted: null,
      analysisCreditsGranted: null,
      adaptationId: adaptation.id,
      paymentId: adaptation.mpPaymentId ?? null,
      message: buildMessage(status, "adaptation"),
    };
  }

  async reconcilePending(limit = 50): Promise<{
    reconciledPlans: number;
    reconciledAdaptations: number;
    total: number;
  }> {
    const [pendingPurchases, pendingAdaptations] = await Promise.all([
      this.database.planPurchase.findMany({
        where: { status: "pending" },
        take: limit,
        orderBy: { createdAt: "asc" },
      }),
      this.database.cvAdaptation.findMany({
        where: { paymentStatus: "pending" },
        take: limit,
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const client = this.getMercadoPagoClient();
    if (!client) {
      this.logger.warn("[reconcile] MP client unavailable — skipping");
      return { reconciledPlans: 0, reconciledAdaptations: 0, total: 0 };
    }

    const paymentClient = new Payment(client);
    let reconciledPlans = 0;
    let reconciledAdaptations = 0;

    for (const purchase of pendingPurchases) {
      try {
        const results = await paymentClient.search({
          options: { external_reference: purchase.paymentReference },
        });
        const approved = results.results?.find((p) => p.status === "approved");
        if (approved) {
          const applied = await this.plansService.applyApprovedPurchase(
            purchase.id,
          );
          if (applied) reconciledPlans++;
        }
      } catch (err) {
        this.logger.warn(
          `[reconcile] plan ${purchase.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    for (const adaptation of pendingAdaptations) {
      if (!adaptation.paymentReference) continue;
      try {
        const results = await paymentClient.search({
          options: { external_reference: adaptation.paymentReference },
        });
        const approved = results.results?.find((p) => p.status === "approved");
        if (!approved) continue;

        await this.database.$transaction(async (tx) => {
          const current = await tx.cvAdaptation.findUnique({
            where: { id: adaptation.id },
          });
          if (!current || current.paymentStatus === "completed") return;

          await tx.cvAdaptation.update({
            where: { id: adaptation.id },
            data: {
              paymentStatus: "completed",
              paidAt: new Date(),
              status: "paid",
              ...(approved.id ? { mpPaymentId: String(approved.id) } : {}),
            },
          });
        });

        reconciledAdaptations++;
      } catch (err) {
        this.logger.warn(
          `[reconcile] adaptation ${adaptation.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    this.logger.log(
      `[reconcile] done — plans: ${reconciledPlans}, adaptations: ${reconciledAdaptations}`,
    );

    return {
      reconciledPlans,
      reconciledAdaptations,
      total: reconciledPlans + reconciledAdaptations,
    };
  }

  private getMercadoPagoClient(): MercadoPagoConfig | null {
    const isProduction =
      process.env.MERCADOPAGO_MODE === "production" ||
      process.env.NODE_ENV === "production";
    const token = isProduction
      ? process.env.MERCADOPAGO_ACCESS_TOKEN
      : (process.env.MERCADOPAGO_ACCESS_TOKEN_TEST ??
        process.env.MERCADOPAGO_ACCESS_TOKEN);

    if (!token) return null;
    return new MercadoPagoConfig({ accessToken: token });
  }
}

function mapPaymentStatus(raw: string): CheckoutStatus {
  if (raw === "completed") return "approved";
  if (raw === "failed") return "failed";
  return "pending";
}

function mapNextAction(status: CheckoutStatus): NextAction {
  if (status === "approved") return "show_success";
  if (status === "failed") return "retry_payment";
  return "keep_waiting";
}

function planTypeToName(planType: string): string | null {
  const names: Record<string, string> = {
    starter: "Starter",
    pro: "Pro",
    turbo: "Turbo",
    unlimited: "Ilimitado",
  };
  return names[planType] ?? null;
}

function buildMessage(
  status: CheckoutStatus,
  type: "plan" | "adaptation",
): string {
  if (status === "approved") {
    return type === "plan"
      ? "Pagamento confirmado! Seus créditos estão disponíveis."
      : "Pagamento confirmado! Seu CV adaptado está pronto.";
  }
  if (status === "failed") {
    return "Pagamento não aprovado. Tente novamente.";
  }
  return "Aguardando confirmação do pagamento...";
}
