// Templates de e-mail do dispatch (relacionamento + confirmação de compra).
//
// O ASSUNTO e o CORPO de cada um são editáveis no admin (aba Emails →
// Templates, tabela EmailDispatchTemplate); sem edição vale o texto padrão
// definido aqui. O corpo é texto simples com variáveis {{nome}}; parágrafos
// separados por linha em branco. O que NÃO é editável, de propósito:
//   - o rodapé de descadastro dos e-mails de relacionamento ({{amazonSESUnsubscribeUrl}}
//     é resolvido pelo SES via ListManagementOptions do tópico de relacionamento) —
//     é sempre acrescentado pelo sistema;
//   - o bloco de resumo da compra ({{resumo}}), montado a partir do snapshot
//     da compra aprovada (valores nunca vêm de texto digitado).
// Regras de conteúdo (uma pergunta no feedback, cupom nunca alega pagamento…)
// são aplicadas por validateTemplate — no salvar e no preview.

export const SES_UNSUBSCRIBE_PLACEHOLDER = "{{amazonSESUnsubscribeUrl}}";

// VIEWED só com evidência (evento analysis_result_viewed com userId
// verificado). NEUTRAL é a pergunta que não presume nada sobre o uso — é o
// padrão sempre que não há evidência confiável (ver
// EmailDispatchService.resolveFeedbackVariant).
export type FeedbackVariant = "VIEWED" | "NEUTRAL";

export type RenderedEmail = { subject: string; text: string; html: string };

export type EmailTemplateKeyValue =
  | "WELCOME"
  | "FEEDBACK_VIEWED"
  | "FEEDBACK_NEUTRAL"
  | "PURCHASE_PAID"
  | "PURCHASE_COUPON";

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKeyValue[] = [
  "WELCOME",
  "FEEDBACK_VIEWED",
  "FEEDBACK_NEUTRAL",
  "PURCHASE_PAID",
  "PURCHASE_COUPON",
];

export type TemplateContent = { subject: string; body: string };

export type TemplateVariable = { name: string; description: string };

export type TemplateDefinition = {
  label: string;
  description: string;
  // Texto padrão (usado enquanto não houver edição salva).
  defaults: TemplateContent;
  variables: TemplateVariable[];
  // Relacionamento: o sistema acrescenta o rodapé de descadastro.
  unsubscribeFooter: boolean;
};

const GREETING_VAR: TemplateVariable = {
  name: "saudacao",
  description: 'Saudação pronta: "Oi, Maria!" (ou "Oi!" sem nome)',
};
const NAME_VAR: TemplateVariable = {
  name: "nome",
  description: "Primeiro nome (vazio se não houver)",
};

export const TEMPLATE_DEFINITIONS: Record<
  EmailTemplateKeyValue,
  TemplateDefinition
> = {
  WELCOME: {
    label: "Boas-vindas",
    description:
      "Enviado ~10 min depois do e-mail verificado (cadastro por senha) ou no cadastro com Google de usuário novo.",
    unsubscribeFooter: true,
    variables: [
      GREETING_VAR,
      NAME_VAR,
      {
        name: "link",
        description:
          "Link para começar uma análise (/adaptar). No máximo um link.",
      },
    ],
    defaults: {
      subject: "Boas-vindas ao EarlyCV",
      body: `{{saudacao}}

Aqui é o Paulo, fundador do EarlyCV. Obrigado por criar sua conta.

O EarlyCV compara o seu currículo com a vaga que você quer e mostra o que ajustar para aumentar suas chances. Para começar, é só enviar seu CV e colar a descrição da vaga:
{{link}}

Qualquer dúvida, responda este e-mail. Eu leio todos.

Paulo
EarlyCV`,
    },
  },
  FEEDBACK_VIEWED: {
    label: "Feedback — viu a análise",
    description:
      "Enviado 24h após o cadastro (janela 8h–20h de Brasília) SÓ quando há evidência de que a pessoa viu o resultado da análise. Exatamente uma pergunta, sem links.",
    unsubscribeFooter: true,
    variables: [GREETING_VAR, NAME_VAR],
    defaults: {
      subject: "Sobre a análise do seu currículo",
      body: `{{saudacao}} Aqui é o Paulo, do EarlyCV.

O que você achou da análise do seu currículo?

Responda este e-mail, mesmo que seja uma frase. Eu leio todas as respostas.

Obrigado,
Paulo
EarlyCV`,
    },
  },
  FEEDBACK_NEUTRAL: {
    label: "Feedback — neutro",
    description:
      "Enviado 24h após o cadastro quando NÃO há evidência confiável de que a pessoa viu a análise. Não pode presumir que viu nem que não viu. Exatamente uma pergunta, sem links.",
    unsubscribeFooter: true,
    variables: [GREETING_VAR, NAME_VAR],
    defaults: {
      subject: "Sua primeira experiência no EarlyCV",
      body: `{{saudacao}} Aqui é o Paulo, do EarlyCV.

Como foi sua primeira experiência com o EarlyCV?

Responda este e-mail, mesmo que seja uma frase. Eu leio todas as respostas.

Obrigado,
Paulo
EarlyCV`,
    },
  },
  PURCHASE_PAID: {
    label: "Compra — pagamento confirmado",
    description:
      "Recibo transacional (Resend), sem descadastro. Informa plano, valor pago e créditos adicionados.",
    unsubscribeFooter: false,
    variables: [
      GREETING_VAR,
      NAME_VAR,
      {
        name: "resumo",
        description:
          "Bloco pronto: Plano / Valor pago / Créditos adicionados (do snapshot da compra)",
      },
      { name: "plano", description: "Nome do plano (ex.: Pro)" },
      { name: "valor", description: "Valor pago (ex.: R$ 49,90)" },
      {
        name: "creditos",
        description:
          'Créditos adicionados (ex.: "5 CVs otimizados e 5 análises")',
      },
      { name: "link", description: "Link para o dashboard" },
    ],
    defaults: {
      subject: "Confirmação da sua compra no EarlyCV",
      body: `{{saudacao}}

Recebemos o pagamento da sua compra no EarlyCV. Segue o resumo:

{{resumo}}

Já está tudo disponível na sua conta: {{link}}

Dúvidas? Escreva para contato@earlycv.com.br.

Equipe EarlyCV`,
    },
  },
  PURCHASE_COUPON: {
    label: "Compra — cupom 100% resgatado",
    description:
      'Recibo de resgate (cupom que zera o preço). NUNCA pode alegar pagamento: não há {{valor}}, "valor pago" nem "recebemos o pagamento".',
    unsubscribeFooter: false,
    variables: [
      GREETING_VAR,
      NAME_VAR,
      {
        name: "resumo",
        description:
          "Bloco pronto: Plano / Créditos adicionados (sem valor pago)",
      },
      { name: "plano", description: "Nome do plano (ex.: Starter)" },
      {
        name: "creditos",
        description:
          'Créditos adicionados (ex.: "3 CVs otimizados e 3 análises")',
      },
      { name: "link", description: "Link para o dashboard" },
    ],
    defaults: {
      subject: "Seu cupom foi resgatado no EarlyCV",
      body: `{{saudacao}}

Seu cupom foi resgatado com sucesso. Nenhum pagamento foi cobrado.

{{resumo}}

Já está tudo disponível na sua conta: {{link}}

Dúvidas? Escreva para contato@earlycv.com.br.

Equipe EarlyCV`,
    },
  },
};

// ---- Validação ----------------------------------------------------------

const SUBJECT_MAX = 150;
const BODY_MAX = 5000;
const URL_PATTERN = /https?:\/\//gi;
const VARIABLE_PATTERN = /\{\{\s*([A-Za-z]+)\s*\}\}/g;

function usedVariables(text: string): string[] {
  return [...text.matchAll(VARIABLE_PATTERN)].map((match) => match[1]);
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

// Devolve a lista de erros (vazia = válido). Nunca lança. As mesmas regras
// valem no salvar e no preview — o admin vê o problema antes de gravar.
export function validateTemplate(
  key: EmailTemplateKeyValue,
  content: TemplateContent,
): string[] {
  const definition = TEMPLATE_DEFINITIONS[key];
  const errors: string[] = [];
  const subject = content.subject.trim();
  const body = content.body.trim();

  if (!subject) errors.push("O assunto é obrigatório.");
  if (subject.length > SUBJECT_MAX) {
    errors.push(`O assunto passa de ${SUBJECT_MAX} caracteres.`);
  }
  if (/[\r\n]/.test(content.subject)) {
    errors.push("O assunto não pode ter quebra de linha.");
  }
  if (subject.includes("{{")) {
    errors.push("O assunto é texto fixo: variáveis {{...}} só valem no corpo.");
  }

  if (!body) errors.push("O corpo é obrigatório.");
  if (body.length > BODY_MAX) {
    errors.push(`O corpo passa de ${BODY_MAX} caracteres.`);
  }

  if (/amazonSES/i.test(body) || /amazonSES/i.test(subject)) {
    errors.push(
      "O link de descadastro é acrescentado pelo sistema; não inclua {{amazonSESUnsubscribeUrl}}.",
    );
  }

  const allowed = new Set(
    definition.variables.map((variable) => variable.name),
  );
  const used = usedVariables(body);
  for (const name of new Set(used)) {
    if (!allowed.has(name)) {
      errors.push(
        `Variável desconhecida: {{${name}}}. Disponíveis: ${[...allowed].map((v) => `{{${v}}}`).join(", ")}.`,
      );
    }
  }

  const has = (name: string) => used.includes(name);

  if (key === "FEEDBACK_VIEWED" || key === "FEEDBACK_NEUTRAL") {
    // Uma única pergunta por e-mail (e o assunto não é pergunta).
    const questions = countMatches(body, /\?/g);
    if (questions !== 1) {
      errors.push(
        `O feedback precisa ter exatamente uma pergunta (um "?"); o corpo tem ${questions}.`,
      );
    }
    if (subject.includes("?")) {
      errors.push("O assunto do feedback não pode ser uma pergunta.");
    }
    if (countMatches(body, URL_PATTERN) > 0) {
      errors.push("O feedback não leva links.");
    }
    if (key === "FEEDBACK_NEUTRAL" && /an[aá]lise|resultado/i.test(body)) {
      errors.push(
        "O feedback neutro não pode mencionar análise/resultado: não presume que a pessoa viu.",
      );
    }
  }

  if (key === "WELCOME") {
    const links =
      countMatches(body, URL_PATTERN) + used.filter((n) => n === "link").length;
    if (links > 1) errors.push("A boas-vindas leva no máximo um link.");
  }

  if (key === "PURCHASE_PAID") {
    const summaryOk =
      has("resumo") || (has("plano") && has("valor") && has("creditos"));
    if (!summaryOk) {
      errors.push(
        "A confirmação de compra precisa informar plano, valor e créditos: use {{resumo}} (ou {{plano}}, {{valor}} e {{creditos}}).",
      );
    }
  }

  if (key === "PURCHASE_COUPON") {
    const summaryOk = has("resumo") || (has("plano") && has("creditos"));
    if (!summaryOk) {
      errors.push(
        "O resgate precisa informar plano e créditos: use {{resumo}} (ou {{plano}} e {{creditos}}).",
      );
    }
    if (
      /R\$/.test(body) ||
      /valor pago/i.test(body) ||
      /recebemos o pagamento/i.test(body) ||
      /pagamento (recebido|confirmado|aprovado)/i.test(body)
    ) {
      errors.push(
        "O resgate de cupom nunca pode alegar pagamento nem mostrar valor pago.",
      );
    }
    if (/compra/i.test(subject)) {
      errors.push('O assunto do resgate não pode falar em "compra".');
    }
  }

  return errors;
}

// ---- Render ---------------------------------------------------------------

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

const FOOTER_PREFIX =
  "Você recebeu este e-mail porque tem uma conta no EarlyCV. Para não receber mais mensagens pessoais como esta (boas-vindas e pedidos de feedback), cancele aqui:";

function footerText(): string {
  return `${FOOTER_PREFIX} ${SES_UNSUBSCRIBE_PLACEHOLDER}`;
}

function toHtml(
  paragraphs: string[],
  options: { unsubscribe: boolean },
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

// Substitui {{variavel}}; desconhecida vira vazio (nunca deixa "{{x}}" no
// e-mail — a validação já impede o salvar, isto é só defesa em profundidade).
function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(
    VARIABLE_PATTERN,
    (_match, name: string) => vars[name] ?? "",
  );
}

export function renderTemplate(
  key: EmailTemplateKeyValue,
  content: TemplateContent,
  vars: Record<string, string>,
): RenderedEmail {
  const definition = TEMPLATE_DEFINITIONS[key];
  const paragraphs = substitute(content.body, vars)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  return {
    subject: content.subject.trim(),
    text: [
      ...paragraphs,
      ...(definition.unsubscribeFooter ? [`—\n${footerText()}`] : []),
    ].join("\n\n"),
    html: toHtml(paragraphs, { unsubscribe: definition.unsubscribeFooter }),
  };
}

// ---- Variáveis por tipo ---------------------------------------------------

function baseVars(name: string | null | undefined): Record<string, string> {
  return { saudacao: greeting(name), nome: firstName(name) ?? "" };
}

export function renderWelcomeEmail(
  input: { name: string | null | undefined; appUrl: string },
  content: TemplateContent = TEMPLATE_DEFINITIONS.WELCOME.defaults,
): RenderedEmail {
  return renderTemplate("WELCOME", content, {
    ...baseVars(input.name),
    link: `${input.appUrl.replace(/\/$/, "")}/adaptar`,
  });
}

export function feedbackKeyFor(
  variant: FeedbackVariant,
): EmailTemplateKeyValue {
  return variant === "VIEWED" ? "FEEDBACK_VIEWED" : "FEEDBACK_NEUTRAL";
}

export function renderFeedbackEmail(
  input: { name: string | null | undefined; variant: FeedbackVariant },
  content?: TemplateContent,
): RenderedEmail {
  const key = feedbackKeyFor(input.variant);
  return renderTemplate(
    key,
    content ?? TEMPLATE_DEFINITIONS[key].defaults,
    baseVars(input.name),
  );
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

export function purchaseKeyFor(
  payload: PurchaseConfirmationPayload,
): EmailTemplateKeyValue {
  return payload.isCouponRedemption ? "PURCHASE_COUPON" : "PURCHASE_PAID";
}

export function renderPurchaseConfirmationEmail(
  input: {
    name: string | null | undefined;
    appUrl: string;
    payload: PurchaseConfirmationPayload;
  },
  content?: TemplateContent,
): RenderedEmail {
  const { payload } = input;
  const key = purchaseKeyFor(payload);
  const redemption = payload.isCouponRedemption;
  const planLabel = PLAN_LABELS[payload.planType] ?? payload.planType;
  const credits = payload.isUnlimited
    ? "acesso ilimitado"
    : describeCredits(payload);
  const valor = redemption
    ? ""
    : formatMoney(payload.amountInCents, payload.currency);

  // Resumo montado SÓ do snapshot da compra (nunca de texto digitado).
  const resumo = [
    `Plano: ${planLabel}`,
    ...(redemption ? [] : [`Valor pago: ${valor}`]),
    payload.isUnlimited
      ? "Acesso: ilimitado"
      : `Créditos adicionados: ${credits}`,
  ].join("\n");

  return renderTemplate(key, content ?? TEMPLATE_DEFINITIONS[key].defaults, {
    ...baseVars(input.name),
    plano: planLabel,
    valor,
    creditos: credits,
    resumo,
    link: `${input.appUrl.replace(/\/$/, "")}/dashboard`,
  });
}

// Dados de exemplo para preview/teste no admin (nunca de uma compra real).
export const SAMPLE_PURCHASE_PAYLOAD: PurchaseConfirmationPayload = {
  planType: "pro",
  amountInCents: 4990,
  currency: "BRL",
  credits: 5,
  analysisCredits: 5,
  isUnlimited: false,
  isCouponRedemption: false,
};

// Renderiza qualquer chave com dados de exemplo — usado no preview do admin.
export function renderSample(
  key: EmailTemplateKeyValue,
  content: TemplateContent,
  appUrl: string,
): RenderedEmail {
  const name = "Maria Souza";
  switch (key) {
    case "WELCOME":
      return renderWelcomeEmail({ name, appUrl }, content);
    case "FEEDBACK_VIEWED":
      return renderFeedbackEmail({ name, variant: "VIEWED" }, content);
    case "FEEDBACK_NEUTRAL":
      return renderFeedbackEmail({ name, variant: "NEUTRAL" }, content);
    case "PURCHASE_PAID":
      return renderPurchaseConfirmationEmail(
        { name, appUrl, payload: SAMPLE_PURCHASE_PAYLOAD },
        content,
      );
    case "PURCHASE_COUPON":
      return renderPurchaseConfirmationEmail(
        {
          name,
          appUrl,
          payload: {
            ...SAMPLE_PURCHASE_PAYLOAD,
            planType: "starter",
            amountInCents: 0,
            credits: 3,
            analysisCredits: 3,
            isCouponRedemption: true,
          },
        },
        content,
      );
  }
}
