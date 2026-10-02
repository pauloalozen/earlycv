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

export type RenderedEmail = { subject: string; text: string; html: string };

export type EmailTemplateKeyValue =
  | "WELCOME"
  | "FEEDBACK_FIRST_USE"
  | "FEEDBACK_SECOND_CALL"
  | "PURCHASE_PAID"
  | "PURCHASE_COUPON"
  | "MOCK_INTERVIEW_OFFER";

export const EMAIL_TEMPLATE_KEYS: EmailTemplateKeyValue[] = [
  "WELCOME",
  "FEEDBACK_FIRST_USE",
  "FEEDBACK_SECOND_CALL",
  "PURCHASE_PAID",
  "PURCHASE_COUPON",
  "MOCK_INTERVIEW_OFFER",
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
  FEEDBACK_FIRST_USE: {
    label: "Feedback",
    description:
      "Enviado 24h após o cadastro (janela 8h–20h de Brasília). O cadastro nasce da primeira análise, então o texto pode falar da análise. Exatamente uma pergunta, sem links.",
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
  FEEDBACK_SECOND_CALL: {
    label: "Feedback segunda chamada",
    description:
      "Enviado 14 dias depois do ENVIO do feedback (janela 8h–20h de Brasília), só se o primeiro foi realmente enviado. Exatamente uma pergunta, sem links.",
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
  MOCK_INTERVIEW_OFFER: {
    label: "Oferta da entrevista simulada",
    description:
      "Enviado 2h depois que uma candidatura vai para Entrevista, só se a pessoa ainda não comprou a entrevista simulada depois disso e não recebeu outra oferta nos últimos 7 dias. Precisa do {{link}}.",
    unsubscribeFooter: true,
    variables: [
      GREETING_VAR,
      NAME_VAR,
      {
        name: "vaga",
        description:
          'Cargo e empresa da candidatura (ex.: "Analista de Dados na Nubank")',
      },
      { name: "preco", description: "Preço atual (ex.: R$ 79,90)" },
      {
        name: "link",
        description: "Link para a página da entrevista simulada",
      },
    ],
    defaults: {
      subject: "Sua entrevista foi marcada. Quer treinar antes?",
      body: `{{saudacao}} Aqui é o Paulo, do EarlyCV.

Vi que a sua candidatura para {{vaga}} chegou na etapa de entrevista. Parabéns, essa é a parte mais difícil de alcançar.

Se quiser chegar mais preparado, faço uma entrevista simulada com você: 45 minutos ao vivo pelo Google Meet, com perguntas baseadas na vaga, feedback na hora e um relatório formal com as minhas recomendações depois da sessão.

Está por {{preco}} na oferta de lançamento:
{{link}}

Boa sorte na entrevista,
Paulo
EarlyCV`,
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

  if (key === "FEEDBACK_FIRST_USE" || key === "FEEDBACK_SECOND_CALL") {
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

  if (key === "MOCK_INTERVIEW_OFFER" && !has("link")) {
    errors.push(
      "A oferta precisa do {{link}} para a página da entrevista simulada.",
    );
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
  "Você recebeu este e-mail porque tem uma conta no EarlyCV. Para não receber mais mensagens pessoais como esta (boas-vindas, pedidos de feedback e ofertas), cancele aqui:";

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

// Os dois feedbacks compartilham o nome do tipo (EmailDispatchKind) e da
// chave de template.
export type FeedbackKind = "FEEDBACK_FIRST_USE" | "FEEDBACK_SECOND_CALL";

export function renderFeedbackEmail(
  input: { name: string | null | undefined; kind: FeedbackKind },
  content?: TemplateContent,
): RenderedEmail {
  const key: EmailTemplateKeyValue = input.kind;
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

// ---- Oferta da entrevista simulada (relacionamento) -----------------------

// Snapshot gravado no enqueue (EmailDispatch.payloadJson), inclusive o
// preço: o e-mail mostra o valor que valia quando a oferta nasceu.
export type MockInterviewOfferPayload = {
  jobApplicationId: string;
  jobTitle: string;
  companyName: string;
  amountInCents: number;
  currency: string;
};

export function isMockInterviewOfferPayload(
  value: unknown,
): value is MockInterviewOfferPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.jobApplicationId === "string" &&
    typeof v.jobTitle === "string" &&
    typeof v.companyName === "string" &&
    typeof v.amountInCents === "number" &&
    typeof v.currency === "string"
  );
}

export function renderMockInterviewOfferEmail(
  input: {
    name: string | null | undefined;
    appUrl: string;
    payload: MockInterviewOfferPayload;
  },
  content: TemplateContent = TEMPLATE_DEFINITIONS.MOCK_INTERVIEW_OFFER.defaults,
): RenderedEmail {
  const { payload } = input;
  const company = payload.companyName.trim();
  const vaga = company
    ? `${payload.jobTitle.trim()} na ${company}`
    : payload.jobTitle.trim();
  const link = `${input.appUrl.replace(/\/$/, "")}/simulacao-de-entrevista?origem=email&candidatura=${encodeURIComponent(payload.jobApplicationId)}`;
  return renderTemplate("MOCK_INTERVIEW_OFFER", content, {
    ...baseVars(input.name),
    vaga,
    preco: formatMoney(payload.amountInCents, payload.currency),
    link,
  });
}

export const SAMPLE_MOCK_INTERVIEW_OFFER_PAYLOAD: MockInterviewOfferPayload = {
  jobApplicationId: "exemplo",
  jobTitle: "Analista de Dados Pleno",
  companyName: "Nubank",
  amountInCents: 7990,
  currency: "BRL",
};

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
    case "FEEDBACK_FIRST_USE":
    case "FEEDBACK_SECOND_CALL":
      return renderFeedbackEmail({ name, kind: key }, content);
    case "PURCHASE_PAID":
      return renderPurchaseConfirmationEmail(
        { name, appUrl, payload: SAMPLE_PURCHASE_PAYLOAD },
        content,
      );
    case "MOCK_INTERVIEW_OFFER":
      return renderMockInterviewOfferEmail(
        { name, appUrl, payload: SAMPLE_MOCK_INTERVIEW_OFFER_PAYLOAD },
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
