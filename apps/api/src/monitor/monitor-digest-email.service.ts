import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import {
  EMAIL_SERVICE,
  type EmailBulkSendMode,
  type EmailMessage,
  type EmailProvider,
  type EmailProviderName,
  type EmailSendOutcome,
  type EmailService,
} from "../email/email.types";
import { EmailConfigService } from "../email/email-config.service";
import { EmailDeliveryProviderAdapter } from "../email/email-delivery-provider.adapter";
import { MAX_RECOMMENDATIONS_PER_DIGEST } from "./monitor-digest-content.service";
import {
  buildMonitorDigestLink,
  buildMonitorJobLink,
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

// Espelha o seed da migration (MonitorDigestEmailContent id="default") —
// só usado se a linha singleton não existir por algum motivo (nunca
// deveria acontecer em operação normal, é defesa em profundidade, não o
// caminho esperado). {count} é o único placeholder suportado; o caso
// singular (1 recomendação) sempre usa a frase fixa abaixo, nunca o
// template do admin, pra nunca quebrar a concordância "1 nova
// oportunidade" (ver AdminMonitorService/monitor-digest-content.dto).
export const DEFAULT_SUBJECT_TEMPLATE =
  "Encontramos {count} novas oportunidades para você";
const SINGULAR_SUBJECT = "Encontramos 1 nova oportunidade para você";
export const DEFAULT_INTRO_TEXT = "";

export type SendDigestResult =
  | {
      sent: true;
      // outcome vem direto do EmailProvider (ver email.types.ts) — o
      // worker é quem decide o status final do MonitorDigest a partir
      // disso (SENT/FAILED/OUTCOME_UNKNOWN), nunca este service.
      outcome: EmailSendOutcome;
      provider: EmailProviderName;
      providerMessageId: string | null;
      errorMessage?: string;
    }
  // skippedReason existe só pra log/observabilidade — o worker decide o
  // status do MonitorDigest (SKIPPED) sem precisar interpretar o texto.
  | { sent: false; skippedReason: string };

@Injectable()
export class MonitorDigestEmailService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(EMAIL_SERVICE)
    private readonly emailService: EmailService,
    // Só usado quando MonitorDigestScheduleConfig.sesMode=LEGACY_RESEND —
    // aí o envio bypassa a fachada/roteamento de categoria por completo e
    // vai direto pro Resend, exatamente como antes desta migração existir.
    // Nunca passa por EmailConfigService.getSesSenderProfile (não faz
    // sentido pro Resend).
    @Inject(EmailDeliveryProviderAdapter)
    private readonly resendAdapter: EmailProvider,
    @Inject(EmailConfigService)
    private readonly emailConfig: Pick<EmailConfigService, "isSesEnabled">,
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
          // Maior aderência primeiro — mesmo critério de
          // monitor-digest-content.service.ts, aplicado explicitamente
          // aqui (não confiar na ordem de inserção implícita do join
          // MonitorDigestRecommendation.createdAt).
          orderBy: [
            { recommendation: { opportunityLevel: "desc" } },
            { recommendation: { recommendedAt: "desc" } },
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

    // digest.recommendations já vem com no máximo
    // MAX_RECOMMENDATIONS_PER_DIGEST itens em operação normal (é o teto
    // aplicado na criação do digest, ver monitor-digest-content.service.ts)
    // — o slice aqui é defesa em profundidade, não o caminho esperado.
    const total = digest.recommendations.length;
    const preview = digest.recommendations.slice(
      0,
      MAX_RECOMMENDATIONS_PER_DIGEST,
    );
    const remaining = total - preview.length;

    const digestLink = buildMonitorDigestLink(digest.id);
    const unsubscribeToken = createMonitorUnsubscribeToken(digest.userId);
    const unsubscribeLink = buildMonitorUnsubscribeLink(unsubscribeToken);

    const content = await this.database.monitorDigestEmailContent.findUnique({
      where: { id: "default" },
    });
    const subjectTemplate = content?.subject ?? DEFAULT_SUBJECT_TEMPLATE;
    const introText = content?.introText ?? DEFAULT_INTRO_TEXT;
    const subject =
      total === 1
        ? SINGULAR_SUBJECT
        : subjectTemplate.replace("{count}", String(total));

    const lines = preview.map(({ recommendation: rec }) => {
      const level =
        OPPORTUNITY_LEVEL_LABELS[rec.opportunityLevel] ?? "Aderente";
      return `- ${rec.job.title} — ${rec.job.company.name} (${level})\n  ${buildMonitorJobLink(rec.job.slug, digest.id, rec.id)}`;
    });

    const text = [
      `Encontramos ${total} ${total === 1 ? "nova oportunidade" : "novas oportunidades"} para você:`,
      ...(introText ? ["", introText] : []),
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
      introText,
    });

    const message = {
      to: digest.user.email,
      subject,
      text,
      html,
      // RFC 8058 (one-click unsubscribe): List-Unsubscribe aponta pro
      // MESMO endpoint do link visível no corpo — GET mostra confirmação
      // sem mutar nada, POST (que é como os clientes de e-mail acionam
      // one-click) desliga de fato. List-Unsubscribe-Post sinaliza
      // explicitamente suporte a POST de um clique, sem exigir abrir o
      // link no browser.
      headers: {
        "List-Unsubscribe": `<${unsubscribeLink}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
      // Chave estável derivada só do digestId (cuid opaco, sem PII) —
      // continua a mesma em qualquer retry deste MESMO MonitorDigest
      // (o worker nunca recria a linha, só reprocessa). Resend reconhece
      // como a mesma requisição via Idempotency-Key; SES não tem
      // equivalente nativo (ignora este campo), por isso as tags abaixo.
      idempotencyKey: `monitor-digest:${digest.id}`,
      // correlationType genérico (não "digestId" solto): o webhook SES só
      // tenta correlacionar com MonitorDigest quando correlationType ===
      // "MONITOR_DIGEST" — qualquer outro tipo (de uma categoria futura)
      // ele ignora com segurança, sem tentar procurar aqui. Tags voltam em
      // `mail.tags` em TODO evento publicado (Send/Delivery/Bounce/
      // Complaint/Reject/Open/Click), sobrevivendo mesmo sem
      // providerMessageId disponível (caso OUTCOME_UNKNOWN).
      tags: { correlationType: "MONITOR_DIGEST", correlationId: digest.id },
    };

    const sesMode = await this.resolveSesMode();
    const result = await this.sendByMode(sesMode, message);
    if (!result) {
      // PAUSED, ou modo exige SES mas SES não está disponível — ver
      // sendByMode. Diferente de "fora da coorte" (decidido no scheduler,
      // nunca chega a criar PENDING) e diferente de FAILED/OUTCOME_UNKNOWN
      // (que exigem ter de fato tentado enviar).
      return {
        sent: false,
        skippedReason:
          sesMode === "PAUSED" ? "ses_mode_paused" : "ses_not_available",
      };
    }

    return {
      sent: true,
      outcome: result.outcome,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      errorMessage: result.errorMessage,
    };
  }

  private async resolveSesMode() {
    const config = await this.database.monitorDigestScheduleConfig.findUnique({
      where: { id: "default" },
      select: { sesMode: true },
    });
    // Sem a linha singleton (defesa em profundidade, nunca o caminho
    // esperado): LEGACY_RESEND é o default seguro, igual ao da migration.
    return config?.sesMode ?? "LEGACY_RESEND";
  }

  // Lido de novo aqui (não só no scheduler): sesMode pode ter mudado entre
  // o scheduler criar o PENDING e o worker processar. Retorna null quando
  // não deve enviar por modo/infra (PAUSED, ou SES exigido mas
  // indisponível) — nunca lança, nunca deixa o worker interpretar isso
  // como falha.
  private async sendByMode(sesMode: EmailBulkSendMode, message: EmailMessage) {
    if (sesMode === "PAUSED") {
      return null;
    }

    if (sesMode === "LEGACY_RESEND") {
      return this.resendAdapter.send(message);
    }

    // SES_ROLLOUT | SES_LIVE
    if (!this.emailConfig.isSesEnabled()) {
      // Modo pede SES mas a infra não está pronta/configurada — trata como
      // pausado (nunca cai pro Resend, por decisão de produto: o volume do
      // digest é justamente o que o Resend não aguenta).
      return null;
    }

    return this.emailService.send({ category: "JOB_ALERT", message });
  }

  private buildHtml(input: {
    total: number;
    preview: Array<{
      recommendation: {
        id: string;
        opportunityLevel: number;
        job: { title: string; slug: string | null; company: { name: string } };
      };
    }>;
    remaining: number;
    digestLink: string;
    unsubscribeLink: string;
    digestId: string;
    introText: string;
  }): string {
    const items = input.preview
      .map(({ recommendation: rec }) => {
        const level =
          OPPORTUNITY_LEVEL_LABELS[rec.opportunityLevel] ?? "Aderente";
        const link = buildMonitorJobLink(rec.job.slug, input.digestId, rec.id);
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
        ${input.introText ? `<p style="color:#3a3a36;font-size:14px;margin:0 0 16px;">${escapeHtml(input.introText)}</p>` : ""}
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
