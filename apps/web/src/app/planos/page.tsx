import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getCvAdaptationContent } from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import { buildPlanCatalog } from "./plan-catalog";
import { ScoreIndicator } from "./score-indicator";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Planos | EarlyCV",
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

type PlanosPageProps = {
  searchParams: Promise<{ error?: string; aid?: string; source?: string }>;
};

export default async function PlanosPage({ searchParams }: PlanosPageProps) {
  const [user, params] = await Promise.all([
    getCurrentAppUserFromCookies(),
    searchParams,
  ]);

  const isAuthenticated = Boolean(user);
  const PLANS = buildPlanCatalog(process.env, { isAuthenticated });
  const error = params.error;
  const adaptationId =
    typeof params.aid === "string" && params.aid.trim().length > 0
      ? params.aid.trim()
      : undefined;
  const showScoreIndicator =
    params.source === "resultado-buy-credits" && Boolean(adaptationId);

  let initialScore: number | null = null;
  let initialProjectedScore: number | null = null;

  if (showScoreIndicator && adaptationId) {
    try {
      const payload = await getCvAdaptationContent(adaptationId);
      const signal = extractDashboardAnalysisSignal(payload.adaptedContentJson);
      initialScore = signal.adjustments.scoreBefore;
      initialProjectedScore = signal.adjustments.scoreFinal;
    } catch {
      initialScore = null;
      initialProjectedScore = null;
    }
  }

  return (
    <PageShell>
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          color: "#0a0a0a",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <AppHeader userName={user?.name} />

        <div
          className="planos-content"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            maxWidth: 1100,
            margin: "0 auto",
            padding: "20px 32px 32px",
            position: "relative",
            zIndex: 2,
            width: "100%",
          }}
        >
          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <h1
              style={{
                fontSize: "clamp(28px, 3.5vw, 44px)",
                fontWeight: 500,
                letterSpacing: -2,
                lineHeight: 1.05,
                margin: "0 0 12px",
              }}
            >
              Seu CV não passa no filtro automático.{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Mude isso.
              </em>
            </h1>
            <p
              style={{
                fontSize: 14.5,
                color: "#45443e",
                lineHeight: 1.5,
                maxWidth: 480,
                margin: "0 auto 12px",
              }}
            >
              Um único CV bem ajustado pode ser a diferença entre ser ignorado
              ou chamado para entrevista.
            </p>
          </div>

          {/* ScoreIndicator */}
          {showScoreIndicator ? (
            <ScoreIndicator
              adaptationId={adaptationId}
              initialScore={initialScore}
              initialProjectedScore={initialProjectedScore}
            />
          ) : null}

          {/* Error */}
          {error && (
            <div
              style={{
                margin: "0 auto 24px",
                maxWidth: 560,
                padding: "10px 16px",
                background: "#fee2e2",
                border: "1px solid #fecaca",
                borderRadius: 10,
                fontFamily: MONO,
                fontSize: 12,
                color: "#991b1b",
                textAlign: "center",
              }}
            >
              {error === "checkout-failed"
                ? "Erro ao iniciar pagamento. Tente novamente."
                : "Plano inválido. Escolha uma das opções abaixo."}
            </div>
          )}

          {/* Plan cards */}
          <div
            className="planos-grid"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${PLANS.length}, 1fr)`,
              gap: 16,
              marginBottom: 24,
              alignItems: "stretch",
              paddingTop: 12,
            }}
          >
            {PLANS.map((plan) => {
              const dark = plan.featured;
              const priceNum = plan.price.replace("R$", "");
              return (
                <div
                  key={plan.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 16,
                    padding: "22px 22px 24px",
                    background: dark ? "#0a0a0a" : "#fafaf6",
                    border: dark ? "none" : "1px solid rgba(10,10,10,0.08)",
                    boxShadow: dark
                      ? "0 28px 70px -20px rgba(10,10,10,0.4)"
                      : "0 1px 2px rgba(0,0,0,0.02)",
                    color: dark ? "#fafaf6" : "#0a0a0a",
                  }}
                >
                  {/* Badge — floats above card for featured */}
                  {dark && plan.badge && (
                    <div
                      style={{
                        position: "absolute",
                        top: -12,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: "#c6ff3a",
                        color: "#0a0a0a",
                        fontFamily: MONO,
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: 1,
                        padding: "4px 12px",
                        borderRadius: 999,
                        whiteSpace: "nowrap",
                      }}
                    >
                      MAIS ESCOLHIDO
                    </div>
                  )}

                  {/* Tag */}
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 1.5,
                      fontWeight: 500,
                      color: dark ? "#a0a098" : "#8a8a85",
                      marginBottom: 6,
                    }}
                  >
                    {plan.label.toUpperCase()}
                  </p>

                  {/* Tagline */}
                  <p
                    style={{
                      fontSize: 16,
                      color: dark ? "#a0a098" : "#6a6560",
                      marginBottom: 18,
                      lineHeight: 1.4,
                    }}
                  >
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 2,
                      marginBottom: 18,
                      paddingBottom: 18,
                      borderBottom: dark
                        ? "1px solid rgba(250,250,246,0.1)"
                        : "1px solid rgba(10,10,10,0.08)",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 13,
                        color: dark ? "#a0a098" : "#6a6560",
                        marginRight: 1,
                      }}
                    >
                      R$
                    </span>
                    <span
                      style={{
                        fontSize: 44,
                        fontWeight: 500,
                        letterSpacing: -2,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        color: dark ? "#fafaf6" : "#0a0a0a",
                      }}
                    >
                      {priceNum}
                    </span>
                    {plan.cents && (
                      <span
                        style={{
                          fontSize: 16,
                          fontWeight: 500,
                          letterSpacing: -0.3,
                          color: dark ? "#a0a098" : "#8a8a85",
                        }}
                      >
                        {plan.cents}
                      </span>
                    )}
                  </div>

                  {/* CTA */}
                  {isAuthenticated ? (
                    <form
                      action={
                        plan.checkoutPlanId ? "/plans/checkout" : "/adaptar"
                      }
                      method={plan.checkoutPlanId ? "post" : "get"}
                    >
                      {plan.checkoutPlanId && (
                        <>
                          <input
                            type="hidden"
                            name="planId"
                            value={plan.checkoutPlanId}
                          />
                          {adaptationId && (
                            <input
                              type="hidden"
                              name="adaptationId"
                              value={adaptationId}
                            />
                          )}
                        </>
                      )}
                      <button
                        type="submit"
                        style={{
                          width: "100%",
                          background: dark ? "#c6ff3a" : "#0a0a0a",
                          color: dark ? "#0a0a0a" : "#fafaf6",
                          border: "none",
                          borderRadius: 10,
                          padding: "12px",
                          fontSize: 13.5,
                          fontWeight: 600,
                          cursor: "pointer",
                          fontFamily: GEIST,
                          marginBottom: 18,
                          boxShadow: dark
                            ? "0 6px 14px rgba(198,255,58,0.25)"
                            : "0 4px 12px rgba(10,10,10,0.12)",
                        }}
                        className={
                          dark ? "planos-cta-dark" : "planos-cta-light"
                        }
                      >
                        {plan.cta}
                      </button>
                    </form>
                  ) : (
                    <a
                      href={
                        plan.id === "free"
                          ? "/entrar?next=/adaptar"
                          : "/entrar?next=/planos"
                      }
                      style={{
                        display: "block",
                        background: dark ? "#c6ff3a" : "#0a0a0a",
                        color: dark ? "#0a0a0a" : "#fafaf6",
                        borderRadius: 10,
                        padding: "12px",
                        fontSize: 13.5,
                        fontWeight: 600,
                        textDecoration: "none",
                        textAlign: "center",
                        fontFamily: GEIST,
                        marginBottom: 18,
                        boxShadow: dark
                          ? "0 6px 14px rgba(198,255,58,0.25)"
                          : "0 4px 12px rgba(10,10,10,0.12)",
                      }}
                      className={dark ? "planos-cta-dark" : "planos-cta-light"}
                    >
                      {plan.cta}
                    </a>
                  )}

                  {/* Features */}
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: 1,
                      fontWeight: 500,
                      color: dark ? "#7a7a74" : "#8a8a85",
                      marginBottom: 8,
                    }}
                  >
                    INCLUSO
                  </p>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 7,
                    }}
                  >
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12.5,
                          color: dark ? "#e8e7df" : "#2a2a28",
                        }}
                      >
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            fontWeight: 700,
                            background: dark
                              ? "rgba(198,255,58,0.9)"
                              : "rgba(198,255,58,0.4)",
                            color: dark ? "#0a0a0a" : "#405410",
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                        {feature}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trust row */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              marginBottom: 20,
            }}
          >
            {[
              "Compatível com ATS usados por empresas como Gupy e LinkedIn",
              "Aumente suas chances de entrevista",
            ].map((text) => (
              <span
                key={text}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#6a6560",
                  letterSpacing: 0.3,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                {text}
              </span>
            ))}
          </div>

          {/* Security strip */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 12,
              padding: "10px 20px",
            }}
          >
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
            <svg
              aria-hidden
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#c6ff3a"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <p
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#45443e",
                margin: 0,
              }}
            >
              Pagamento seguro via{" "}
              <span style={{ color: "#0a0a0a" }}>Mercado Pago</span> · Acesso
              imediato · Sem renovação automática
            </p>
          </div>
        </div>
      </main>

      <style>{`
        .planos-cta-dark:hover { opacity: 0.88; }
        .planos-cta-light:hover { opacity: 0.82; }
        @media (max-width: 860px) {
          .planos-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        @media (max-width: 768px) {
          .planos-content { padding: 20px 16px 48px !important; }
        }
        @media (max-width: 520px) {
          .planos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </PageShell>
  );
}
