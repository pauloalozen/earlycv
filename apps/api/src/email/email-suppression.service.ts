import { Inject, Injectable, Logger } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import type { SesEventPayload } from "./ses-event.util";

// Subtipos de bounce Permanent que de fato dizem "o endereço não recebe":
// General/NoEmail (rejeição do servidor de destino) e Suppressed/
// OnAccountSuppressionList (SES recusa por histórico de bounce duro).
// Qualquer outro subtipo (inclusive os que o SES usa por política:
// EmailValidationSuppressed, OnTenantSuppressionList) NÃO vira supressão.
const HARD_BOUNCE_SUBTYPES = new Set([
  "General",
  "NoEmail",
  "Suppressed",
  "OnAccountSuppressionList",
]);

// Segundo a documentação da AWS, enviar para um contato DESCADASTRADO do
// tópico gera um evento Bounce. Isso é decisão do contato sobre UM tópico,
// não um endereço inválido — nunca pode suprimir as outras categorias
// (independência dos descadastros por tópico). O formato exato desse bounce
// não está na documentação; descartamos por subtipo (lista acima) e por
// diagnóstico que mencione descadastro/tópico/lista. A validação com um
// evento real está pendente (ver runbook).
const OPT_OUT_BOUNCE_PATTERN =
  /unsubscrib|opt[\s_-]?out|topic|contact[\s_-]?list/i;

// Diagnóstico do bounce para o log SEM PII: e-mails viram [email] e o texto é
// truncado. Serve para descobrir, num evento real, como o SES descreve o bounce
// gerado por envio a contato descadastrado (formato não documentado).
function redactDiagnostic(value: string | undefined): string {
  return (value ?? "")
    .replace(/[^\s<>"']+@[^\s<>"']+/g, "[email]")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export type EmailSuppressionLookup = {
  reason: "HARD_BOUNCE" | "COMPLAINT";
} | null;

// Supressão por ENDEREÇO compartilhada entre categorias (JOB_ALERT,
// PRODUCT_ANNOUNCEMENT, RELATIONSHIP...) — alimentada pelo dispatcher do
// webhook SES para QUALQUER evento, não por categoria. Só entra:
//   - Complaint (sempre);
//   - Bounce com bounceType === "Permanent" (bounce duro).
// Bounce Transient/Undetermined (caixa cheia, servidor temporariamente
// fora) NUNCA suprime — o endereço pode estar bom amanhã.
//
// Hoje só o fluxo de relacionamento LÊ esta tabela (isSuppressed); fazer
// Monitor/Product Updates lerem é um passo futuro (fora desta entrega, que
// não os migra). O SES já mantém sua própria suppression list de conta.
@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async recordFromSesEvent(
    payload: SesEventPayload,
    providerEventId: string,
  ): Promise<{ recorded: number }> {
    let reason: "HARD_BOUNCE" | "COMPLAINT" | null = null;
    let recipients: Array<{ emailAddress?: string }> = [];
    let bounceSubType: string | null = null;

    if (payload.eventType === "Bounce") {
      // Só bounce DURO. Transient/Undetermined/ausente: nada a fazer.
      const typeLabel = payload.bounce?.bounceType ?? "none";
      const subTypeLabel = payload.bounce?.bounceSubType ?? "none";
      const diagnostic = redactDiagnostic(
        payload.bounce?.bouncedRecipients?.[0]?.diagnosticCode,
      );
      const category = payload.mail?.tags?.category?.[0] ?? "unknown";
      const decision = (action: string, why: string) =>
        this.logger.log(
          `email_suppression_decision event=Bounce type=${typeLabel} subtype=${subTypeLabel} category=${category} action=${action} reason=${why} diagnostic="${diagnostic}"`,
        );

      if (payload.bounce?.bounceType !== "Permanent") {
        decision("ignored", "not_permanent");
        return { recorded: 0 };
      }
      if (!HARD_BOUNCE_SUBTYPES.has(payload.bounce.bounceSubType ?? "")) {
        decision("ignored", "subtype_not_hard");
        return { recorded: 0 };
      }
      const looksLikeOptOut = (payload.bounce.bouncedRecipients ?? []).some(
        (recipient) =>
          OPT_OUT_BOUNCE_PATTERN.test(recipient.diagnosticCode ?? ""),
      );
      if (looksLikeOptOut) {
        decision("ignored", "optout_diagnostic");
        return { recorded: 0 };
      }
      reason = "HARD_BOUNCE";
      recipients = payload.bounce.bouncedRecipients ?? [];
      bounceSubType = payload.bounce.bounceSubType ?? null;
    } else if (payload.eventType === "Complaint") {
      reason = "COMPLAINT";
      recipients = payload.complaint?.complainedRecipients ?? [];
    }

    if (!reason) {
      return { recorded: 0 };
    }

    const occurredAtRaw =
      reason === "HARD_BOUNCE"
        ? payload.bounce?.timestamp
        : payload.complaint?.timestamp;
    const occurredAt = occurredAtRaw ? new Date(occurredAtRaw) : new Date();
    const sourceCategory = payload.mail?.tags?.category?.[0] ?? null;

    let recorded = 0;
    for (const recipient of recipients) {
      const email = recipient.emailAddress?.trim().toLowerCase();
      if (!email) continue;

      await this.database.emailSuppression.upsert({
        where: { email },
        create: {
          email,
          reason,
          bounceSubType,
          sourceCategory,
          providerEventId,
          occurredAt,
        },
        // Complaint sobrescreve bounce duro; bounce duro nunca rebaixa um
        // complaint já registrado.
        update:
          reason === "COMPLAINT"
            ? { reason, sourceCategory, providerEventId, occurredAt }
            : {},
      });
      recorded += 1;
    }

    if (recorded > 0) {
      // Nunca logar o e-mail — só contagem, motivo e categoria de origem.
      this.logger.log(
        `email suppression recorded: reason=${reason} count=${recorded} sourceCategory=${sourceCategory ?? "unknown"}`,
      );
    }

    return { recorded };
  }

  // Todos os endereços suprimidos (bounce duro + complaint). A tabela só
  // cresce com problemas reais de entrega, então é pequena — usada para
  // excluir destinatários na seleção de campanhas.
  async listSuppressedEmails(): Promise<string[]> {
    const rows = await this.database.emailSuppression.findMany({
      select: { email: true },
    });
    return rows.map((row) => row.email);
  }

  async findByEmail(email: string): Promise<EmailSuppressionLookup> {
    const row = await this.database.emailSuppression.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { reason: true },
    });
    return row ? { reason: row.reason } : null;
  }
}
