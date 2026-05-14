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
  cta_lading: string;
  cta_link: string;
  features: string[];
  checkoutPlanId: PaidPlanId | null;
  downloadCredits: number | null;
  unitPriceCents: number | null;
};

type BuildPlanCatalogOptions = {
  isAuthenticated?: boolean;
};

type Env = Record<string, string | undefined>;

function requireEnvInt(env: Env, name: string): number {
  const raw = env[name];
  if (!raw) throw new Error(`Required env var ${name} is not set`);
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Env var ${name} must be a valid integer, got: "${raw}"`);
  }
  return value;
}

function formatCents(cents: number): { whole: string; decimal: string } {
  const reais = Math.floor(cents / 100);
  const centavos = (cents % 100).toString().padStart(2, "0");
  return { whole: `R$${reais}`, decimal: `,${centavos}` };
}

function unitPriceLabel(totalCents: number, qty: number): string {
  const unitReais = (Math.round(totalCents / qty) / 100)
    .toFixed(2)
    .replace(".", ",");
  return `Neste pacote o download de CV sai a R$ ${unitReais}`;
}

export function buildPlanCatalog(
  env: Env,
  options?: BuildPlanCatalogOptions,
): PlanCatalogItem[] {
  const starterCents = requireEnvInt(env, "PRICE_PLAN_STARTER");
  const proCents = requireEnvInt(env, "PRICE_PLAN_PRO");
  const turboCents = requireEnvInt(env, "PRICE_PLAN_TURBO");

  const qntStarterDownloads = requireEnvInt(env, "QNT_CV_PLAN_STARTER");
  const qntProDownloads = requireEnvInt(env, "QNT_CV_PLAN_PRO");
  const qntTurboDownloads = requireEnvInt(env, "QNT_CV_PLAN_TURBO");

  const starterPrice = formatCents(starterCents);
  const proPrice = formatCents(proCents);
  const turboPrice = formatCents(turboCents);

  const plans: PlanCatalogItem[] = [
    {
      id: "free",
      label: "Free",
      price: "R$0",
      cents: ",00",
      description: "Para começar sem pagar",
      featured: false,
      badge: "Grátis",
      cta: "Começar grátis",
      cta_lading: "Começar grátis",
      cta_link: "/adaptar",
      checkoutPlanId: null,
      downloadCredits: null,
      unitPriceCents: null,
      features: [
        "Análises gratuitas",
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
      cta_lading: "Comprar e ajustar meu CV",
      cta_link: "/plans/checkout?plan=starter",
      checkoutPlanId: "starter",
      downloadCredits: qntStarterDownloads,
      unitPriceCents: Math.round(starterCents / qntStarterDownloads),
      features: [
        `${qntStarterDownloads} créditos de download de CV`,
        "Análises gratuitas incluídas",
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
      cta_lading: "Comprar pacote Pro",
      cta_link: "/plans/checkout?plan=pro",
      checkoutPlanId: "pro",
      downloadCredits: qntProDownloads,
      unitPriceCents: Math.round(proCents / qntProDownloads),
      features: [
        `${qntProDownloads} créditos de download de CV`,
        "Análises gratuitas incluídas",
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Download em PDF e DOCX",
        "Pontos fortes e melhorias",
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
      cta_lading: "Comprar pacote Turbo",
      cta_link: "/plans/checkout?plan=turbo",
      checkoutPlanId: "turbo",
      downloadCredits: qntTurboDownloads,
      unitPriceCents: Math.round(turboCents / qntTurboDownloads),
      features: [
        `${qntTurboDownloads} créditos de download de CV`,
        "Análises gratuitas incluídas",
        "Score de compatibilidade ATS",
        "Análise de keywords da vaga",
        "Download em PDF e DOCX",
        "Pontos fortes e melhorias",
      ],
    },
  ];

  if (options?.isAuthenticated) {
    return plans.filter((plan) => plan.id !== "free");
  }

  return plans;
}
