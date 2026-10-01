// Templates finais de relacionamento — curtos, em nome do Paulo, sem
// banner, no máximo um link de ação + o de descadastro. {{amazonSESUnsubscribeUrl}}
// é resolvido pelo SES (ListManagementOptions do tópico de relacionamento);
// nenhum token/endpoint de descadastro nosso. Resposta vai para o Reply-To
// do remetente de relacionamento (contato@earlycv.com.br).

export const SES_UNSUBSCRIBE_PLACEHOLDER = "{{amazonSESUnsubscribeUrl}}";

// VIEWED só com evidência (evento analysis_result_viewed com userId
// verificado). NEUTRAL é a pergunta que não presume nada sobre o uso — é o
// padrão sempre que não há evidência confiável (ver
// EmailDispatchService.resolveFeedbackVariant).
export type FeedbackVariant = "VIEWED" | "NEUTRAL";

export type RenderedEmail = { subject: string; text: string; html: string };

function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first ? first : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function greeting(name: string | null | undefined): string {
  const first = firstName(name);
  return first ? `Oi, ${first}!` : "Oi!";
}

function toHtml(
  paragraphs: string[],
  options: { unsubscribe: boolean } = { unsubscribe: true },
): string {
  const body = paragraphs
    .map(
      (paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`,
    )
    .join("\n");
  return `<div style="font-family:-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.55;color:#0a0a0a;max-width:520px;">
${body}
${
  options.unsubscribe
    ? `<p style="color:#8a8a85;font-size:12px;margin-top:28px;">${escapeHtml(FOOTER_PREFIX)} <a href="${SES_UNSUBSCRIBE_PLACEHOLDER}" style="color:#8a8a85;">cancelar</a></p>`
    : ""
}
</div>`;
}

const FOOTER_PREFIX =
  "Você recebeu este e-mail porque tem uma conta no EarlyCV. Para não receber mais mensagens pessoais como esta (boas-vindas e pedidos de feedback), cancele aqui:";

function footerText(): string {
  return `${FOOTER_PREFIX} ${SES_UNSUBSCRIBE_PLACEHOLDER}`;
}

export function renderWelcomeEmail(input: {
  name: string | null | undefined;
  appUrl: string;
}): RenderedEmail {
  const startUrl = `${input.appUrl.replace(/\/$/, "")}/adaptar`;
  const paragraphs = [
    greeting(input.name),
    "Aqui é o Paulo, fundador do EarlyCV. Obrigado por criar sua conta.",
    `O EarlyCV compara o seu currículo com a vaga que você quer e mostra o que ajustar para aumentar suas chances. Para começar, é só enviar seu CV e colar a descrição da vaga:\n${startUrl}`,
    "Qualquer dúvida, responda este e-mail. Eu leio todos.",
    "Paulo\nEarlyCV",
  ];
  const footer = footerText();

  return {
    subject: "Boas-vindas ao EarlyCV",
    text: [...paragraphs, `—\n${footer}`].join("\n\n"),
    html: toHtml(paragraphs),
  };
}

export function renderFeedbackEmail(input: {
  name: string | null | undefined;
  variant: FeedbackVariant;
}): RenderedEmail {
  const viewed = input.variant === "VIEWED";
  // Uma única pergunta por e-mail (e o assunto não é pergunta).
  const paragraphs = [
    `${greeting(input.name)} Aqui é o Paulo, do EarlyCV.`,
    viewed
      ? "O que você achou da análise do seu currículo?"
      : "Como foi sua primeira experiência com o EarlyCV?",
    "Responda este e-mail, mesmo que seja uma frase. Eu leio todas as respostas.",
    "Obrigado,\nPaulo\nEarlyCV",
  ];
  const footer = footerText();

  return {
    subject: viewed
      ? "Sobre a análise do seu currículo"
      : "Sua primeira experiência no EarlyCV",
    text: [...paragraphs, `—\n${footer}`].join("\n\n"),
    html: toHtml(paragraphs),
  };
}

// ---- Confirmação de compra (transacional, BILLING) ------------------------

// Snapshot gravado em EmailDispatch.payloadJson no instante da aprovação —
// o e-mail nunca relê a compra (valores não mudam depois, mesmo com
// estorno/edição). Valor e moeda são os da PlanPurchase aprovada.
export type PurchaseConfirmationPayload = {
  planType: string;
  amountInCents: number;
  currency: string;
  credits: number;
  analysisCredits: number;
  isUnlimited: boolean;
  // Resgate de cupom 100% (sem pagamento): o e-mail NUNCA alega pagamento.
  isCouponRedemption: boolean;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Gratuito",
  starter: "Starter",
  pro: "Pro",
  turbo: "Turbo",
  unlimited: "Ilimitado",
};

export function formatMoney(amountInCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency,
    }).format(amountInCents / 100);
  } catch {
    return `${(amountInCents / 100).toFixed(2)} ${currency}`;
  }
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function describeCredits(payload: PurchaseConfirmationPayload): string {
  const parts = [
    plural(payload.credits, "CV otimizado", "CVs otimizados"),
    ...(payload.analysisCredits > 0
      ? [plural(payload.analysisCredits, "análise", "análises")]
      : []),
  ];
  return parts.join(" e ");
}

export function renderPurchaseConfirmationEmail(input: {
  name: string | null | undefined;
  appUrl: string;
  payload: PurchaseConfirmationPayload;
}): RenderedEmail {
  const { payload } = input;
  const dashboardUrl = `${input.appUrl.replace(/\/$/, "")}/dashboard`;
  const redemption = payload.isCouponRedemption;
  const planLabel = PLAN_LABELS[payload.planType] ?? payload.planType;

  const summary = [
    `Plano: ${planLabel}`,
    ...(redemption
      ? []
      : [
          `Valor pago: ${formatMoney(payload.amountInCents, payload.currency)}`,
        ]),
    payload.isUnlimited
      ? "Acesso: ilimitado"
      : `Créditos adicionados: ${describeCredits(payload)}`,
  ];

  const paragraphs = [
    greeting(input.name),
    redemption
      ? "Seu cupom foi resgatado com sucesso. Nenhum pagamento foi cobrado."
      : "Recebemos o pagamento da sua compra no EarlyCV. Segue o resumo:",
    summary.join("\n"),
    `Já está tudo disponível na sua conta: ${dashboardUrl}`,
    "Dúvidas? Escreva para contato@earlycv.com.br.",
    "Equipe EarlyCV",
  ];

  return {
    subject: redemption
      ? "Seu cupom foi resgatado no EarlyCV"
      : "Confirmação da sua compra no EarlyCV",
    text: paragraphs.join("\n\n"),
    html: toHtml(paragraphs, { unsubscribe: false }),
  };
}
