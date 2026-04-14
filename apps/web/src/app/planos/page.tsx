import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { buildPlanCatalog } from "./plan-catalog";
import { PlanosFocusRemount } from "./planos-focus-remount";
import { ScoreIndicator } from "./score-indicator";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Planos | EarlyCV",
};

const PLANS = buildPlanCatalog(process.env);

type PlanosPageProps = {
  searchParams: Promise<{ error?: string }>;
};

function CheckIcon({ dark }: { dark: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke={dark ? "rgba(255,255,255,0.5)" : "#AAAAAA"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

export default async function PlanosPage({ searchParams }: PlanosPageProps) {
  const [user, params] = await Promise.all([
    getCurrentAppUserFromCookies(),
    searchParams,
  ]);

  const isAuthenticated = Boolean(user);
  const error = params.error;

  return (
    <PlanosFocusRemount>
      <main className="flex min-h-screen flex-col bg-[#F2F2F2] text-[#111111]">
        <AppHeader userName={user?.name} backgroundColor="#F2F2F2" />

        <section className="flex flex-1 flex-col items-center justify-between px-6 py-6 md:px-10">
          <div className="w-full max-w-5xl space-y-5">
            {/* Badge */}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#111111] bg-[#111111] px-4 py-1.5 text-sm font-medium text-white">
                <span className="text-lime-400">●</span>
                Nossos planos
              </span>
            </div>

            {/* Hero */}
            <div className="space-y-2 text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-[#111111]">
                Seu CV não está passando no filtro automático
              </h1>
              <p className="mx-auto max-w-md text-sm text-[#666666]">
                Um único CV bem ajustado pode ser a diferença entre ser ignorado
                ou chamado para entrevista
              </p>
            </div>

            {/* Score indicator — só aparece se há análise prévia */}
            <ScoreIndicator />

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-700">
                {error === "checkout-failed"
                  ? "Erro ao iniciar pagamento. Tente novamente."
                  : "Plano inválido. Escolha uma das opções abaixo."}
              </div>
            )}

            {/* Cards */}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((plan) => (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl p-6 ${
                    plan.featured
                      ? "bg-[#111111] text-white shadow-xl"
                      : "bg-white text-[#111111] shadow-sm"
                  }`}
                >
                  {/* Name + description */}
                  <p
                    className={`text-base font-bold ${plan.featured ? "text-white" : "text-[#111111]"}`}
                  >
                    {plan.label}
                  </p>
                  <p
                    className={`mt-0.5 text-xs ${plan.featured ? "text-white/60" : "text-[#888888]"}`}
                  >
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div className="mt-4 flex items-end gap-0.5">
                    <span
                      className={`text-4xl font-bold leading-none tabular-nums ${plan.featured ? "text-white" : "text-[#111111]"}`}
                    >
                      {plan.price}
                    </span>
                    <span
                      className={`mb-0.5 text-lg font-semibold ${plan.featured ? "text-white/70" : "text-[#888888]"}`}
                    >
                      {plan.cents}
                    </span>
                  </div>

                  {/* CTA */}
                  <div className="mt-4">
                    {isAuthenticated ? (
                      <form
                        action={
                          plan.checkoutPlanId ? "/plans/checkout" : "/adaptar"
                        }
                        method={plan.checkoutPlanId ? "post" : "get"}
                      >
                        {plan.checkoutPlanId ? (
                          <input
                            type="hidden"
                            name="planId"
                            value={plan.checkoutPlanId}
                          />
                        ) : null}
                        <button
                          type="submit"
                          style={
                            plan.featured ? { color: "#111111" } : undefined
                          }
                          className={`w-full rounded-[12px] py-2.5 text-[11px] font-medium leading-none transition-colors ${
                            plan.featured
                              ? "bg-white text-[#111111] hover:bg-stone-100"
                              : "bg-[#F2F2F2] text-[#111111] hover:bg-[#E8E8E8]"
                          }`}
                        >
                          {plan.cta}
                        </button>
                      </form>
                    ) : (
                      <a
                        href={
                          plan.id === "free"
                            ? isAuthenticated
                              ? "/adaptar"
                              : "/entrar?next=/adaptar"
                            : "/entrar?next=/planos"
                        }
                        style={plan.featured ? { color: "#111111" } : undefined}
                        className={`block w-full rounded-[14px] py-3 text-center text-[11px] font-medium leading-none transition-colors ${
                          plan.featured
                            ? "bg-white text-[#111111] hover:bg-stone-100"
                            : "bg-[#F2F2F2] text-[#111111] hover:bg-[#E8E8E8]"
                        }`}
                      >
                        {plan.cta}
                      </a>
                    )}
                  </div>

                  {/* Divider */}
                  <div
                    className={`my-4 h-px ${plan.featured ? "bg-white/10" : "bg-[#F0F0F0]"}`}
                  />

                  {/* Features */}
                  <p
                    className={`mb-2.5 text-[10px] font-bold uppercase tracking-widest ${plan.featured ? "text-white/40" : "text-[#AAAAAA]"}`}
                  >
                    Incluso
                  </p>
                  <ul className="space-y-2">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2.5">
                        <CheckIcon dark={plan.featured} />
                        <span
                          className={`text-xs leading-snug ${plan.featured ? "text-white/80" : "text-[#444444]"}`}
                        >
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {/* Badge */}
                  {plan.badge && (
                    <span className="absolute right-5 top-5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white">
                      {plan.badge}
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Prova de valor */}
            <div className="flex flex-col items-center gap-2 text-center">
              <p className="flex items-center gap-2 text-sm font-semibold text-[#444444]">
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#84cc16"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Compatível com ATS usados por empresas como Gupy e LinkedIn
              </p>
              <p className="flex items-center gap-2 text-sm font-semibold text-[#444444]">
                <svg
                  aria-hidden="true"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#84cc16"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Aumente suas chances de entrevista
              </p>
            </div>
          </div>

          <div className="w-full max-w-5xl pt-4">
            <div className="flex items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white px-5 py-3">
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#84cc16"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <p className="text-sm font-semibold text-[#444444]">
                Pagamento seguro via{" "}
                <span className="text-[#111111]">Mercado Pago</span> · Acesso
                imediato · Sem renovação automática
              </p>
            </div>
          </div>
        </section>
      </main>
    </PlanosFocusRemount>
  );
}
