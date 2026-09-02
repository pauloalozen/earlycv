import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import {
  EMAIL_DELIVERY_PORT,
  type EmailDeliveryPort,
} from "../email/email-delivery.port";
import { MAX_RECOMMENDATIONS_IN_BODY } from "./monitor-digest-content.service";
import {
  buildMonitorDigestLink,
  buildMonitorLogoUrl,
  buildMonitorUnsubscribeLink,
} from "./monitor-digest-links";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { createMonitorUnsubscribeToken } from "./monitor-unsubscribe-token";

const OPPORTUNITY_LEVEL_LABELS: Record<number, string> = {
  5: "Feita para você",
  4: "Muito aderente",
  3: "Aderente",
};

export type SendDigestResult =
  | { sent: true; providerMessageId: string | null }
  // skippedReason existe só pra log/observabilidade — o worker decide o
  // status do MonitorDigest (SKIPPED) sem precisar interpretar o texto.
  | { sent: false; skippedReason: string };

@Injectable()
export class MonitorDigestEmailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_DELIVERY_PORT)
    private readonly emailDelivery: EmailDeliveryPort,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  async sendDigest(digestId: string): Promise<SendDigestResult> {
    const digest = await this.database.monitorDigest.findUnique({
      where: { id: digestId },
      include: {
        user: { select: { id: true, email: true, name: true } },
        recommendations: {
          include: {
            recommendation: {
              include: { job: { include: { company: true } } },
            },
          },
          // Vaga mais recente primeiro — mesmo critério de
          // monitor-digest-content.service.ts, aplicado explicitamente
          // aqui (não confiar na ordem de inserção implícita do join
          // MonitorDigestRecommendation.createdAt).
          orderBy: [
            { recommendation: { recommendedAt: "desc" } },
            { recommendation: { opportunityLevel: "desc" } },
          ],
        },
      },
    });

    if (!digest) {
      return { sent: false, skippedReason: "digest_not_found" };
    }

    if (digest.recommendations.length === 0) {
      // Nunca acontece na prática (o scheduler só cria PENDING com pelo
      // menos 1 recomendação), mas nunca manda e-mail vazio de qualquer
      // forma — defesa em profundidade.
      return { sent: false, skippedReason: "no_recommendations" };
    }

    // Verificado de novo aqui (não só na descoberta): o usuário pode ter
    // desativado o e-mail (ou dado unsubscribe) entre o scheduler criar o
    // PENDING e o worker efetivamente processar.
    const preference = await this.database.monitorAlertPreference.findUnique({
      where: { userId: digest.userId },
    });
    if (!preference?.emailEnabled) {
      return { sent: false, skippedReason: "email_disabled" };
    }

    // Mesma lógica: entitlement também pode ter mudado entre a descoberta
    // e o envio de fato. Nunca apaga o MonitorDigest/MonitorDigestRecommendation
    // já criados — só decide não enviar o e-mail.
    const entitlement = await this.entitlementService.canUseMonitor(
      digest.userId,
    );
    if (!entitlement.allowed) {
      return { sent: false, skippedReason: "not_entitled" };
    }

    const total = digest.recommendations.length;
    const preview = digest.recommendations.slice(
      0,
      MAX_RECOMMENDATIONS_IN_BODY,
    );
    const remaining = total - preview.length;

    const digestLink = buildMonitorDigestLink(digest.id);
    const unsubscribeToken = createMonitorUnsubscribeToken(digest.userId);
    const unsubscribeLink = buildMonitorUnsubscribeLink(unsubscribeToken);

    const subject = `Encontramos ${total} ${total === 1 ? "nova oportunidade" : "novas oportunidades"} para você`;

    const lines = preview.map(({ recommendation: rec }) => {
      const level =
        OPPORTUNITY_LEVEL_LABELS[rec.opportunityLevel] ?? "Aderente";
      return `- ${rec.job.title} — ${rec.job.company.name} (${level})\n  ${buildMonitorDigestLink(digest.id, rec.id)}`;
    });

    const text = [
      `Encontramos ${total} ${total === 1 ? "nova oportunidade" : "novas oportunidades"} para você:`,
      "",
      ...lines,
      ...(remaining > 0
        ? ["", `+ ${remaining} outras no seu Alerta de Vaga Certa.`]
        : []),
      "",
      `Ver minhas oportunidades: ${digestLink}`,
      "",
      `Não quer mais receber esses e-mails? Cancelar: ${unsubscribeLink}`,
    ].join("\n");

    const html = this.buildHtml({
      total,
      preview,
      remaining,
      digestLink,
      unsubscribeLink,
      digestId: digest.id,
    });

    const result = await this.emailDelivery.send({
      to: digest.user.email,
      subject,
      text,
      html,
      // RFC 8058 (one-click unsubscribe): List-Unsubscribe aponta pro MESMO
      // endpoint do link visível no corpo — GET mostra confirmação sem
      // mutar nada, POST (que é como os clientes de e-mail acionam
      // one-click) desliga de fato. List-Unsubscribe-Post sinaliza
      // explicitamente suporte a POST de um clique, sem exigir abrir o
      // link no browser.
      headers: {
        "List-Unsubscribe": `<${unsubscribeLink}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // Chave estável derivada só do digestId (cuid opaco, sem PII) —
      // continua a mesma em qualquer retry deste MESMO MonitorDigest
      // (o worker nunca recria a linha, só reprocessa), então o Resend
      // reconhece retries como a mesma requisição em vez de reenviar.
      idempotencyKey: `monitor-digest:${digest.id}`,
    });

    return { sent: true, providerMessageId: result.providerMessageId };
  }

  private buildHtml(input: {
    total: number;
    preview: Array<{
      recommendation: {
        id: string;
        opportunityLevel: number;
        job: { title: string; company: { name: string } };
      };
    }>;
    remaining: number;
    digestLink: string;
    unsubscribeLink: string;
    digestId: string;
  }): string {
    const items = input.preview
      .map(({ recommendation: rec }) => {
        const level =
          OPPORTUNITY_LEVEL_LABELS[rec.opportunityLevel] ?? "Aderente";
        const link = buildMonitorDigestLink(input.digestId, rec.id);
        return `
          <tr>
            <td style="padding:12px 0;border-bottom:1px solid #eee;">
              <a href="${link}" style="color:#0a0a0a;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(rec.job.title)}</a>
              <div style="color:#6a6560;font-size:13px;margin-top:2px;">${escapeHtml(rec.job.company.name)}</div>
              <div style="color:#1f7a34;font-size:12px;margin-top:4px;font-weight:600;">${escapeHtml(level)}</div>
            </td>
          </tr>`;
      })
      .join("");

    // Mesma fonte (Geist) e composição de peso do wordmark real
    // (apps/web/src/components/logo.tsx): "early" leve (300) + "CV" bold
    // (700), nunca "EarlyCV" concatenado.
    const GEIST = "'Geist', -apple-system, system-ui, sans-serif";
    return `
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@300;700&display=swap" />
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
        <table role="presentation" style="margin-bottom:20px;">
          <tr>
            <td style="vertical-align:middle;padding-right:8px;">
              <img src="${buildMonitorLogoUrl()}" width="24" height="24" alt="earlyCV" style="display:block;border:0;border-radius:6px;" />
            </td>
            <td style="vertical-align:middle;font-size:14px;letter-spacing:-0.01em;">
              <span style="font-family:${GEIST};font-weight:300;">early</span><span style="font-family:${GEIST};font-weight:700;">CV</span>
            </td>
          </tr>
        </table>
        <h1 style="font-size:19px;font-weight:600;">Encontramos ${input.total} ${input.total === 1 ? "nova oportunidade" : "novas oportunidades"} para você</h1>
        <table role="presentation" style="width:100%;border-collapse:collapse;">${items}</table>
        ${input.remaining > 0 ? `<p style="color:#6a6560;font-size:13px;">+ ${input.remaining} outras no seu Alerta de Vaga Certa.</p>` : ""}
        <p style="margin:24px 0;">
          <a href="${input.digestLink}" style="background:#0a0a0a;color:#fafaf6;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600;display:inline-block;">Ver minhas oportunidades</a>
        </p>
        <p style="color:#8a8a85;font-size:11px;margin-top:32px;">
          Você está recebendo isso porque o Alerta de Vaga Certa está ativo na sua conta EarlyCV.
          <a href="${input.unsubscribeLink}" style="color:#8a8a85;">Cancelar esses e-mails</a>.
        </p>
      </div>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
