import type { Metadata } from "next";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Planos | EarlyCV",
};

const PLANS = [
  {
    id: "starter" as const,
    label: "1 CV otimizado",
    price: "R$19,90",
    description: "Ideal para uma vaga específica",
    featured: false,
    badge: null,
  },
  {
    id: "pro" as const,
    label: "5 CVs otimizados",
    price: "R$39,90",
    description: "Aplique para várias vagas com estratégia",
    featured: true,
    badge: "Mais escolhido",
  },
  {
    id: "unlimited" as const,
    label: "Uso ilimitado por 30 dias",
    price: "R$99,90",
    description: "Para quem está em busca ativa",
    featured: false,
    badge: null,
  },
];

type PlanosPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function PlanosPage({ searchParams }: PlanosPageProps) {
  const [user, params] = await Promise.all([
    getCurrentAppUserFromCookies(),
    searchParams,
  ]);

  const isAuthenticated = Boolean(user);
  const error = params.error;

  return (
    <main className="flex min-h-screen flex-col bg-[#FAFAFA] text-[#111111]">
      <header className="flex shrink-0 items-center justify-between px-10 py-6">
        <a
          href="/"
          style={{ color: "#111111" }}
          className="font-logo text-2xl tracking-tight"
        >
          earlyCV
        </a>
        <a
          href="/adaptar/resultado"
          className="text-sm text-[#666666] transition-colors hover:text-[#111111]"
        >
          ← Voltar para análise
        </a>
      </header>

      <section className="flex flex-1 flex-col items-center px-6 py-10 md:px-10">
        <div className="w-full max-w-3xl space-y-10">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-[#111111]">
              Escolha seu plano
            </h1>
            <p className="text-base text-[#666666]">
              Cancele quando quiser. Acesso imediato após pagamento.
            </p>
          </div>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
              {error === "checkout-failed"
                ? "Erro ao iniciar pagamento. Tente novamente."
                : "Plano inválido. Escolha uma das opções abaixo."}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-xl bg-white p-6 shadow-sm ${
                  plan.featured ? "ring-2 ring-[#111111]" : ""
                }`}
              >
                {plan.badge && (
                  <span className="mb-4 self-start rounded-full bg-[#111111] px-3 py-1 text-[11px] font-bold text-white">
                    {plan.badge}
                  </span>
                )}

                <p className="text-2xl font-bold text-[#111111]">
                  {plan.price}
                </p>
                <p className="mt-1 text-base font-medium text-[#111111]">
                  {plan.label}
                </p>
                <p className="mt-2 flex-1 text-sm text-[#666666]">
                  {plan.description}
                </p>

                <div className="mt-6">
                  {isAuthenticated ? (
                    <form action="/plans/checkout" method="post">
                      <input type="hidden" name="planId" value={plan.id} />
                      <button
                        type="submit"
                        style={{ color: plan.featured ? "#ffffff" : "#111111" }}
                        className={`w-full rounded-[14px] py-4 text-base font-medium leading-none transition-colors ${
                          plan.featured
                            ? "bg-[#111111] hover:bg-[#222222]"
                            : "bg-[#F2F2F2] hover:bg-[#E8E8E8]"
                        }`}
                      >
                        Selecionar plano
                      </button>
                    </form>
                  ) : (
                    <a
                      href={`/entrar?next=/planos`}
                      style={{ color: plan.featured ? "#ffffff" : "#111111" }}
                      className={`block w-full rounded-[14px] py-4 text-center text-base font-medium leading-none transition-colors ${
                        plan.featured
                          ? "bg-[#111111] hover:bg-[#222222]"
                          : "bg-[#F2F2F2] hover:bg-[#E8E8E8]"
                      }`}
                    >
                      Selecionar plano
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-[#AAAAAA]">
            Pagamento seguro via Mercado Pago · Acesso imediato · Sem renovação
            automática
          </p>
        </div>
      </section>
    </main>
  );
}
