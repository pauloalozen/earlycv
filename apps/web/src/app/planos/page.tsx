import type { Metadata } from "next";
import { AppHeader } from "@/components/app-header";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
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
  searchParams: Promise<{ error?: string }>;
};

export default async function PlanosPage({ searchParams }: PlanosPageProps) {
  const [user, params] = await Promise.all([
    getCurrentAppUserFromCookies(),
    searchParams,
  ]);

  const PLANS = buildPlanCatalog(process.env);

  const isAuthenticated = Boolean(user);
  const error = params.error;

  return (
    <>
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
        }}
      >
        <AppHeader
          userName={user?.name}
          
        />

        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "32px 32px 64px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Kicker */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                fontWeight: 500,
                color: "#555",
                background: "rgba(10,10,10,0.04)",
                border: "1px solid rgba(10,10,10,0.06)",
                padding: "6px 10px",
                borderRadius: 999,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  boxShadow: "0 0 6px #c6ff3a",
                  display: "inline-block",
                }}
              />
              PLANOS · EARLYCV
            </div>
          </div>

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: 36 }}>
            <h1
              style={{
                fontSize: "clamp(36px, 4vw, 52px)",
                fontWeight: 500,
                letterSpacing: -2,
                lineHeight: 1.02,
                margin: "0 0 14px",
              }}
            >
              Escolha o plano{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                certo para você.
              </em>
            </h1>
            <p
              style={{
                fontSize: 16,
                color: "#45443e",
                lineHeight: 1.55,
                maxWidth: 480,
                margin: "0 auto",
              }}
            >
              Um único CV bem ajustado pode ser a diferença entre ser ignorado
              ou chamado para entrevista.
            </p>
          </div>

          {/* ScoreIndicator */}
          <ScoreIndicator />

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
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginBottom: 40,
            }}
          >
            {PLANS.map((plan) => {
              const dark = plan.featured;
              return (
                <div
                  key={plan.id}
                  style={{
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    borderRadius: 16,
                    padding: "24px 22px",
                    background: dark ? "#0a0a0a" : "#fafaf6",
                    border: dark
                      ? "none"
                      : "1px solid rgba(10,10,10,0.08)",
                    boxShadow: dark
                      ? "0 24px 60px -20px rgba(10,10,10,0.4)"
                      : "0 1px 2px rgba(0,0,0,0.03)",
                    color: dark ? "#fafaf6" : "#0a0a0a",
                  }}
                >
                  {/* Badge */}
                  {plan.badge && (
                    <span
                      style={{
                        position: "absolute",
                        top: 16,
                        right: 16,
                        fontFamily: MONO,
                        fontSize: 9.5,
                        fontWeight: 600,
                        letterSpacing: 0.8,
                        background: dark ? "rgba(198,255,58,0.2)" : "rgba(10,10,10,0.07)",
                        color: dark ? "#c6ff3a" : "#1a1a1a",
                        border: dark ? "1px solid rgba(198,255,58,0.25)" : "1px solid rgba(10,10,10,0.12)",
                        padding: "3px 8px",
                        borderRadius: 999,
                      }}
                    >
                      {plan.badge}
                    </span>
                  )}

                  {/* Name */}
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      letterSpacing: 1.2,
                      fontWeight: 500,
                      color: dark ? "#8a8a85" : "#8a8a85",
                      marginBottom: 4,
                    }}
                  >
                    {plan.label.toUpperCase()}
                  </p>
                  <p
                    style={{
                      fontSize: 12.5,
                      color: dark ? "rgba(250,250,246,0.55)" : "#6a6560",
                      marginBottom: 20,
                      lineHeight: 1.4,
                    }}
                  >
                    {plan.description}
                  </p>

                  {/* Price */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-end",
                      gap: 2,
                      marginBottom: 18,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 42,
                        fontWeight: 500,
                        letterSpacing: -2,
                        lineHeight: 1,
                        fontVariantNumeric: "tabular-nums",
                        color: dark ? "#fafaf6" : "#0a0a0a",
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      style={{
                        fontSize: 18,
                        fontWeight: 500,
                        color: dark
                          ? "rgba(250,250,246,0.5)"
                          : "#8a8a85",
                        marginBottom: 4,
                      }}
                    >
                      {plan.cents}
                    </span>
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
                        <input
                          type="hidden"
                          name="planId"
                          value={plan.checkoutPlanId}
                        />
                      )}
                      <button
                        type="submit"
                        style={{
                          width: "100%",
                          background: dark ? "#fafaf6" : "#0a0a0a",
                          color: dark ? "#0a0a0a" : "#fafaf6",
                          border: "none",
                          borderRadius: 10,
                          padding: "12px",
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: "pointer",
                          fontFamily: GEIST,
                          letterSpacing: -0.1,
                          boxShadow: dark
                            ? "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)"
                            : "none",
                        }}
                        className={dark ? "planos-cta-dark" : "planos-cta-light"}
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
                        background: dark ? "#fafaf6" : "#0a0a0a",
                        color: dark ? "#0a0a0a" : "#fafaf6",
                        borderRadius: 10,
                        padding: "12px",
                        fontSize: 13,
                        fontWeight: 500,
                        textDecoration: "none",
                        textAlign: "center",
                        fontFamily: GEIST,
                        letterSpacing: -0.1,
                        boxShadow: dark
                          ? "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)"
                          : "none",
                      }}
                      className={dark ? "planos-cta-dark" : "planos-cta-light"}
                    >
                      {plan.cta}
                    </a>
                  )}

                  {/* Divider */}
                  <div
                    style={{
                      height: 1,
                      background: dark
                        ? "rgba(250,250,246,0.08)"
                        : "rgba(10,10,10,0.06)",
                      margin: "18px 0",
                    }}
                  />

                  {/* Features */}
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: 1.2,
                      fontWeight: 500,
                      color: dark ? "rgba(250,250,246,0.35)" : "#8a8a85",
                      marginBottom: 10,
                    }}
                  >
                    INCLUSO
                  </p>
                  <ul
                    style={{
                      listStyle: "none",
                      padding: 0,
                      margin: 0,
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                    }}
                  >
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          fontSize: 12.5,
                          color: dark
                            ? "rgba(250,250,246,0.7)"
                            : "#45443e",
                          lineHeight: 1.4,
                        }}
                      >
                        <span
                          style={{
                            color: dark ? "#c6ff3a" : "#8a8a85",
                            fontSize: 11,
                            marginTop: 1,
                            flexShrink: 0,
                          }}
                        >
                          ✓
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {/* Social proof */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              marginBottom: 24,
            }}
          >
            {[
              "Compatível com ATS usados por empresas como Gupy e LinkedIn",
              "Aumente suas chances de entrevista",
            ].map((text) => (
              <p
                key={text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#45443e",
                }}
              >
                <span style={{ color: "#c6ff3a", fontSize: 14 }}>✓</span>
                {text}
              </p>
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
              padding: "14px 20px",
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
        @media (max-width: 520px) {
          .planos-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
