type PaidPlanId = "starter" | "pro" | "turbo";

export type PlanCatalogItem = {
  id: "free" | PaidPlanId;
  label: string;
  price: string;
  cents: string;
  description: string;
  featured: boolean;
  badge: string | null;
  cta: string;
  features: string[];
  checkoutPlanId: PaidPlanId | null;
};

function parseCents(
  envVal: string | undefined,
  fallback: number,
): { whole: string; decimal: string } {
  const parsed = Number.parseInt(envVal ?? String(fallback), 10);
  const cents = Number.isFinite(parsed) ? parsed : fallback;
  const reais = Math.floor(cents / 100);
  const centavos = (cents % 100).toString().padStart(2, "0");
  return { whole: `R$${reais}`, decimal: `,${centavos}` };
}

function parseQuantity(envVal: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(envVal ?? String(fallback), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildPlanCatalog(env: NodeJS.ProcessEnv): PlanCatalogItem[] {
  const starterPrice = parseCents(env.PRICE_PLAN_STARTER, 1190);
  const proPrice = parseCents(env.PRICE_PLAN_PRO, 2990);
  const turboPrice = parseCents(env.PRICE_PLAN_TURBO, 5990);

  const qntStarterDownloads = parseQuantity(env.QNT_CV_PLAN_STARTER, 1);
  const qntProDownloads = parseQuantity(env.QNT_CV_PLAN_PRO, 3);
  const qntTurboDownloads = parseQuantity(env.QNT_CV_PLAN_TURBO, 10);

  const qntFreeAnalyses = parseQuantity(env.QNT_AN_PLAN_FREE, 3);
  const qntStarterAnalyses = parseQuantity(env.QNT_AN_PLAN_STARTER, 6);
  const qntProAnalyses = parseQuantity(env.QNT_AN_PLAN_PRO, 9);
  const qntTurboAnalyses = parseQuantity(env.QNT_AN_PLAN_TURBO, 30);

  return [
    {
      id: "free",
      label: "Free",
      price: "R$0",
      cents: ",00",
      description: "Para começar sem pagar",
      featured: false,
      badge: "Grátis",
      cta: "Começar grátis",
      checkoutPlanId: null,
      features: [
        `${qntFreeAnalyses} análises de vaga por dia`,
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Sem cartão de crédito",
      ],
    },
    {
      id: "starter",
      label: "Starter",
      price: starterPrice.whole,
      cents: starterPrice.decimal,
      description: "Para uma vaga específica",
      featured: false,
      badge: null,
      cta: "Ajustar meu CV agora",
      checkoutPlanId: "starter",
      features: [
        `${qntStarterAnalyses} análises de vaga`,
        `${qntStarterDownloads} crédito de download de CV`,
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Download em PDF e DOCX",
        "Pontos fortes e melhorias",
      ],
    },
    {
      id: "pro",
      label: "Pro",
      price: proPrice.whole,
      cents: proPrice.decimal,
      description: "Para quem aplica para várias vagas",
      featured: true,
      badge: "Mais escolhido",
      cta: "Aumentar as chances",
      checkoutPlanId: "pro",
      features: [
        `${qntProAnalyses} análises de vaga`,
        `${qntProDownloads} créditos de download de CV`,
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Download em PDF e DOCX",
        "Pontos fortes e melhorias",
        "Processamento prioritário",
      ],
    },
    {
      id: "turbo",
      label: "Turbo",
      price: turboPrice.whole,
      cents: turboPrice.decimal,
      description: "Para quem aplica todos os dias",
      featured: false,
      badge: null,
      cta: "Aplicar para mais vagas",
      checkoutPlanId: "turbo",
      features: [
        `${qntTurboAnalyses} análises de vaga`,
        `${qntTurboDownloads} créditos de download de CV`,
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Download em PDF e DOCX",
        "Pontos fortes e melhorias",
        "Processamento prioritário",
      ],
    },
  ];
}
