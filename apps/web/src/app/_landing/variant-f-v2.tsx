import Link from "next/link";
import { Logo } from "@/components/logo";
import { PublicFooter } from "@/components/public-footer";
import type { TopCompany } from "@/lib/internal-jobs-api";
import { siteConfig } from "@/lib/site";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { FeatureShowcase } from "./_feature-showcase";
import { LinkedInVsRadarMock } from "./_linkedin-radar-mock";
import { FEATURE_PAGES } from "./_shared";
import { GuestAnalysisWidget } from "./guest-analysis-widget";
import { DepoimentosSection } from "./variant-e-testimonials";

/** Nav label override — canonical product name is "Radar de Oportunidades";
 * FEATURE_PAGES (shared across the site) still says "Radar de Vagas". */
function navDropdownLabel(p: (typeof FEATURE_PAGES)[number]) {
  return p.href === "/radar-de-vagas" ? "Radar de Oportunidades" : p.label;
}

/** Nomes de empresa vindos do crawler chegam com maiúsculas inconsistentes
 * (ex: "MAGAZINE LUIZA"). Deixa cada palavra com só a inicial maiúscula —
 * exceto siglas curtas (≤3 letras, ex: "XP", "BTG", "AB"), que ficam como
 * estão. Nomes que já têm caixa mista (ex: "iFood") não são tocados. */
function formatCompanyName(name: string): string {
  return name
    .split(" ")
    .map((word) => {
      const isAllCaps = word.length > 0 && word === word.toUpperCase();
      if (!isAllCaps || word.length <= 3) return word;
      return word.charAt(0) + word.slice(1).toLowerCase();
    })
    .join(" ");
}

const GEIST =
  'var(--font-ubuntu), -apple-system, "Segoe UI", system-ui, sans-serif';
const MONO =
  'var(--font-ubuntu-mono), ui-monospace, "SF Mono", Menlo, monospace';
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const COMPANIES = [
  "Itaú",
  "Nubank",
  "Stone",
  "iFood",
  "Mercado Livre",
  "Globo",
  "Ambev",
  "Magazine Luiza",
  "XP Investimentos",
  "BTG Pactual",
  "Vivo",
  "Totvs",
  "Localiza",
  "Twilio",
  "Porto Seguro",
  "AB InBev",
  "Riachuelo",
  "Unimed",
  "Stefanini",
  "Iugu",
  "Braze",
  "Dress To",
  "SAS Educação",
] as const;

const container: React.CSSProperties = {
  width: "100%",
  maxWidth: 1120,
  margin: "0 auto",
  padding: "0 32px",
};

const sectionLabel: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 11,
  fontWeight: 400,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#8a8a85",
};

const btnPrimary: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#fff",
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 14.6,
  fontWeight: 400,
  display: "inline-flex",
  alignItems: "center",
  gap: 10,
  letterSpacing: -0.1,
  boxShadow:
    "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
  fontFamily: GEIST,
  whiteSpace: "nowrap",
};

const btnGhost: React.CSSProperties = {
  background: "transparent",
  color: "#0a0a0a",
  fontSize: 14,
  fontWeight: 400,
  padding: 14,
  textDecoration: "underline",
  textDecorationColor: "rgba(10,10,10,0.2)",
  textUnderlineOffset: 4,
  fontFamily: GEIST,
};

const browserFrame: React.CSSProperties = {
  background: "#fff",
  borderRadius: 14,
  overflow: "hidden",
  boxShadow:
    "0 30px 70px -24px rgba(10,10,10,0.35), 0 1px 2px rgba(10,10,10,0.06)",
  border: "1px solid rgba(10,10,10,0.06)",
};

function BrowserChrome() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "10px 14px",
        background: "#f2f2ee",
        borderBottom: "1px solid rgba(10,10,10,0.06)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "rgba(10,10,10,0.14)",
          }}
        />
      ))}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={sectionLabel}>{children}</div>;
}

const PREP_QUESTIONS = [
  "Por que você quer trabalhar na Nubank?",
  "Como você aborda problemas de escala em React?",
  "Relate uma situação de conflito no time e como resolveu.",
];

const PREP_STRENGTHS = [
  "React · Node.js em produção",
  "Experiência com fintech",
];

const PREP_ALERTS = ["AWS pouco detalhado no CV", "CI/CD não mencionado"];

/** Mockup compacto do widget de preparação de entrevista, para usar dentro de um browserFrame. */
function InterviewPrepMock() {
  return (
    <div style={{ padding: "18px 18px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#c6ff3a",
            boxShadow: "0 0 5px #c6ff3a",
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 0.8,
            color: "#3a3a38",
            fontWeight: 500,
          }}
        >
          PREP · NUBANK – SENIOR DEV
        </span>
      </div>

      <div
        style={{
          background: "#fafaf6",
          border: "1px solid rgba(10,10,10,0.07)",
          borderRadius: 9,
          padding: "10px 12px",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9,
            letterSpacing: 1,
            color: "#8a8a85",
            marginBottom: 5,
          }}
        >
          EMPRESA
        </div>
        <p
          style={{
            fontSize: 12.5,
            color: "#45443e",
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Nubank tende a focar em cultura de dono e escalabilidade técnica em
          processos para eng. sênior.
        </p>
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 0.8,
          color: "#6a6a66",
          marginBottom: 8,
        }}
      >
        Perguntas prováveis
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          marginBottom: 14,
        }}
      >
        {PREP_QUESTIONS.map((q, i) => (
          <div
            key={q}
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.07)",
              borderRadius: 8,
              padding: "8px 10px",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#b0aea8",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              0{i + 1}
            </span>
            <span
              style={{ fontSize: 12.5, color: "#2a2a28", lineHeight: 1.4 }}
            >
              {q}
            </span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <div
          style={{
            background: "rgba(198,255,58,0.12)",
            border: "1px solid rgba(110,150,20,0.2)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: 0.8,
              color: "#4a7008",
              marginBottom: 5,
              fontWeight: 600,
            }}
          >
            ↑ PONTOS FORTES
          </div>
          {PREP_STRENGTHS.map((s) => (
            <div
              key={s}
              style={{ fontSize: 11, color: "#2a4a08", lineHeight: 1.5 }}
            >
              · {s}
            </div>
          ))}
        </div>
        <div
          style={{
            background: "rgba(255,200,80,0.1)",
            border: "1px solid rgba(180,130,20,0.2)",
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              letterSpacing: 0.8,
              color: "#7a5008",
              marginBottom: 5,
              fontWeight: 600,
            }}
          >
            △ ATENÇÃO
          </div>
          {PREP_ALERTS.map((a) => (
            <div
              key={a}
              style={{ fontSize: 11, color: "#5a3a08", lineHeight: 1.5 }}
            >
              · {a}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        style={{
          width: "100%",
          background: "#0a0a0a",
          color: "#fff",
          border: "none",
          borderRadius: 9,
          padding: "11px",
          fontSize: 13,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: "inherit",
          letterSpacing: -0.1,
        }}
      >
        Praticar perguntas →
      </button>
    </div>
  );
}

/** Graphic link between narrative blocks — numbered badge + connecting ticks. */
function JourneyDivider({
  step,
  children,
  end,
}: {
  step: string;
  children: React.ReactNode;
  end?: boolean;
}) {
  return (
    <div
      className="reveal-card"
      style={{
        padding: end ? "36px 32px 40px" : "36px 32px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{ width: 2, height: 22, background: "rgba(10,10,10,0.16)" }}
      />
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: MONO,
          fontSize: 14,
          fontWeight: 400,
          ...(end
            ? {
                background: "#fff",
                color: "#0a0a0a",
                border: "1.5px solid #0a0a0a",
              }
            : {
                background: "#0a0a0a",
                color: "#c6ff3a",
                boxShadow: "0 10px 24px -8px rgba(10,10,10,0.35)",
              }),
        }}
      >
        {step}
      </div>
      <p
        style={{
          fontFamily: end ? GEIST : SERIF_ITALIC,
          fontStyle: end ? "normal" : "italic",
          fontSize: end ? 10.5 : 16,
          letterSpacing: end ? 0.4 : undefined,
          textTransform: end ? "uppercase" : undefined,
          color: end ? "#8a8a85" : "#6a6a66",
          textAlign: "center",
          margin: 0,
          maxWidth: 420,
        }}
      >
        {children}
      </p>
      {!end && (
        <div
          style={{ width: 2, height: 22, background: "rgba(10,10,10,0.16)" }}
        />
      )}
    </div>
  );
}

export function LandingVariantF2({
  guestAnalysisAuthGateEnabled,
  isAuthenticated,
  topCompanies,
}: {
  guestAnalysisAuthGateEnabled: boolean;
  isAuthenticated: boolean;
  topCompanies: TopCompany[];
}) {
  // Fallback ilustrativo só pra nunca deixar o marquee vazio (ex: ambiente
  // sem vagas ainda seedadas) — sem link, já que não representa vaga real.
  const marqueeCompanies: { name: string; slug: string | null }[] =
    topCompanies.length > 0
      ? topCompanies.map((c) => ({
          name: formatCompanyName(c.name),
          slug: c.slug,
        }))
      : COMPANIES.map((name) => ({
          name: formatCompanyName(name),
          slug: null,
        }));

  return (
    <main
      style={{ fontFamily: GEIST, color: "#0a0a0a", background: "#ffffff" }}
    >
      <LandingScrollAnimations />

      {/* NAV */}
      <nav
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 16,
          padding: "18px 32px",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
        }}
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            justifySelf: "start",
          }}
        >
          <Logo />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              border: "1px solid #d8d6ce",
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 400,
            }}
          >
            v2.1
          </span>
        </Link>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            justifySelf: "center",
          }}
        >
          <div className="lp-fv2-nav-dropdown">
            <span
              className="lp-fv2-nav-dropdown-trigger"
              style={{ fontSize: 13, color: "#3a3a38", cursor: "default" }}
            >
              Produtos
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#3a3a38"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>abrir menu</title>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
            <div className="lp-fv2-nav-dropdown-panel">
              <div className="lp-fv2-nav-dropdown-grid">
                {FEATURE_PAGES.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="lp-fv2-nav-dropdown-item"
                  >
                    <span className="lp-fv2-nav-dropdown-icon">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#0a0a0a"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>{navDropdownLabel(p)}</title>
                        <path d={p.icon} />
                      </svg>
                    </span>
                    <span>
                      <span className="lp-fv2-nav-dropdown-label">
                        {navDropdownLabel(p)}
                      </span>
                      <span className="lp-fv2-nav-dropdown-desc">
                        {p.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="lp-fv2-nav-dropdown-cta-row">
                <Link href="/adaptar" className="lp-fv2-nav-dropdown-cta">
                  Analisar meu CV grátis
                </Link>
              </div>
            </div>
          </div>
          <a href="#como-funciona" style={{ fontSize: 13, color: "#3a3a38" }}>
            Como funciona
          </a>
          <a href="#faq" style={{ fontSize: 13, color: "#3a3a38" }}>
            Perguntas
          </a>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 26,
            justifySelf: "end",
          }}
        >
          {!isAuthenticated && (
            <Link href="/entrar" style={{ fontSize: 13, color: "#3a3a38" }}>
              Entrar
            </Link>
          )}
          <Link
            href={isAuthenticated ? "/meu-perfil" : "/entrar?tab=cadastro"}
            style={{
              ...btnPrimary,
              padding: "0 16px",
              height: 34,
              borderRadius: 8,
              fontSize: 12.6,
            }}
          >
            {isAuthenticated ? "Meu Perfil" : "Criar conta"}
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "144px 32px 0" }}>
        <div
          style={{
            ...container,
            maxWidth: 820,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div className="lp-fv2-kicker" style={{ marginBottom: 26 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 6px #c6ff3a",
                display: "inline-block",
                flexShrink: 0,
              }}
            />
            ANÁLISE GRÁTIS · SEM CARTÃO · RESULTADO IMEDIATO
          </div>

          <h1
            style={{
              fontSize: "clamp(34px, 6.4vw, 60px)",
              fontWeight: 400,
              letterSpacing: -2.2,
              lineHeight: 1.02,
              margin: "0 0 22px",
            }}
          >
            Um CV{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              ajustado
            </em>{" "}
            pra cada vaga,
            <br />
            antes de todo mundo.
          </h1>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.55,
              fontWeight: 300,
              color: "#5c5a52",
              margin: "0 0 32px",
              maxWidth: 560,
            }}
          >
            Você pode ser filtrado antes de alguém ler o seu CV. A gente mostra
            o que ajustar, encontra vagas novas direto na fonte e acompanha você
            até a entrevista.
          </p>

          <Link href="#analise" style={{ ...btnPrimary, marginBottom: 56 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>Editar</title>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Analisar meu CV grátis <span>→</span>
          </Link>

          <SectionLabel>TUDO QUE VOCÊ PRECISA PRA SER CHAMADO</SectionLabel>

          <FeatureShowcase />
        </div>
      </section>

      {/* LOGO WALL — continuous marquee */}
      <section style={{ padding: "72px 0 88px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", marginBottom: 28 }}
        >
          <SectionLabel>USUÁRIOS APLICANDO PARA AS EMPRESAS AGORA</SectionLabel>
        </div>
        <div className="lp-fv2-marquee-mask reveal-card">
          <div className="lp-fv2-marquee-track">
            {[0, 1, 2, 3].map((setIdx) =>
              marqueeCompanies.map((company) =>
                setIdx === 0 && company.slug ? (
                  <Link
                    href={`/radar/empresa/${company.slug}`}
                    rel="nofollow"
                    className="lp-fv2-company-badge"
                    key={`${setIdx}-${company.name}`}
                  >
                    <span>{company.name}</span>
                  </Link>
                ) : (
                  <div
                    className="lp-fv2-company-badge"
                    key={`${setIdx}-${company.name}`}
                    aria-hidden
                  >
                    <span>{company.name}</span>
                  </div>
                ),
              ),
            )}
          </div>
        </div>
        <p
          className="reveal-card"
          style={{
            ...container,
            textAlign: "center",
            fontSize: 14,
            color: "#8a8a85",
            marginTop: 22,
          }}
        >
          Encontre você também sua oportunidade agora mesmo no nosso{" "}
          <Link
            href="/radar"
            style={{
              color: "#8a8a85",
              textDecoration: "underline",
              textDecorationColor: "rgba(10,10,10,0.2)",
              textUnderlineOffset: 4,
            }}
          >
            Radar →
          </Link>
        </p>
      </section>

      {/* UPLOAD MODULE */}
      <section
        id="analise"
        style={{
          padding: "72px 32px",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        <div style={{ ...container, maxWidth: 1120, textAlign: "center" }}>
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            <h2
              className="reveal-card"
              style={{
                fontSize: "clamp(24px, 3.6vw, 36px)",
                fontWeight: 400,
                letterSpacing: -1,
                margin: "0 0 10px",
              }}
            >
              Receba seu score ATS{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                grátis
              </em>
            </h2>
            <p
              className="reveal-card"
              style={{ fontSize: 15.1, color: "#45443e", margin: "0 0 28px" }}
            >
              <strong style={{ color: "#0a0a0a" }}>32% de ganho médio</strong>{" "}
              de aderência à vaga já no primeiro ajuste.
            </p>
          </div>

          {!isAuthenticated && guestAnalysisAuthGateEnabled && (
            <p
              className="reveal-card"
              style={{
                fontFamily: MONO,
                fontSize: 14,
                letterSpacing: 0.3,
                color: "#8a8a85",
                margin: "0 0 16px",
              }}
            >
              Envie sem cadastro. Crie sua conta grátis pra ver o resultado
              completo.
            </p>
          )}

          <div style={{ maxWidth: 940, margin: "0 auto" }}>
            <GuestAnalysisWidget
              guestAnalysisAuthGateEnabled={guestAnalysisAuthGateEnabled}
              isAuthenticated={isAuthenticated}
            />
          </div>

          <Link
            href="/demo-resultado"
            className="reveal-card"
            style={{
              marginTop: 20,
              border: "1px solid rgba(10,10,10,0.14)",
              color: "#0a0a0a",
              background: "#fff",
              borderRadius: 10,
              padding: "13px 20px",
              fontSize: 14,
              fontWeight: 400,
              fontFamily: GEIST,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Ver exemplo</title>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Ver um exemplo de análise
          </Link>
        </div>
      </section>

      {/* PROOF / METRICS BAND */}
      <section style={{ background: "#0a0a0a", padding: "56px 32px" }}>
        <div
          className="reveal-card"
          style={{
            ...container,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 28,
          }}
        >
          <div style={{ maxWidth: 340 }}>
            <div style={{ ...sectionLabel, color: "#8a8a85", marginBottom: 8 }}>
              POR QUE ISSO IMPORTA
            </div>
            <div
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontSize: 26,
                color: "#fafaf6",
                letterSpacing: -0.3,
                lineHeight: 1.15,
              }}
            >
              O ATS decide antes de um humano ler.
            </div>
          </div>
          <div style={{ display: "flex", gap: 44, flexWrap: "wrap" }}>
            {[
              {
                num: "70",
                suffix: "/100",
                label: "score médio\nantes do ajuste",
                color: "#fafaf6",
              },
              {
                num: "+30",
                suffix: "",
                label: "pontos\npossíveis por CV",
                color: "#c6ff3a",
              },
              {
                num: "13",
                suffix: "",
                label: "ajustes\nidentificados em média",
                color: "#fafaf6",
              },
            ].map((s) => (
              <div key={s.label}>
                <div
                  style={{
                    fontSize: 32,
                    fontWeight: 400,
                    color: s.color,
                    letterSpacing: -1,
                  }}
                >
                  {s.num}
                  {s.suffix && (
                    <span style={{ fontSize: 16, color: "#8a8a85" }}>
                      {s.suffix}
                    </span>
                  )}
                </div>
                <div
                  style={{
                    fontSize: 10.7,
                    color: "#8a8a85",
                    lineHeight: 1.25,
                    fontFamily: MONO,
                    letterSpacing: 0.3,
                    textTransform: "uppercase",
                    whiteSpace: "pre-line",
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* JORNADA — abertura editorial */}
      <section style={{ padding: "72px 32px 40px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center" }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>DA VAGA À ENTREVISTA</SectionLabel>
          </div>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 40px)",
              fontWeight: 400,
              letterSpacing: -1.2,
              margin: 0,
            }}
          >
            Encontrar cedo. Ajustar{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              certo
            </em>
            . Chegar preparado.
          </h2>
        </div>
      </section>

      {/* DEEP FEATURE 1 — Radar */}
      <section id="radar" style={{ padding: "56px 32px 0" }}>
        <div
          className="lp-fv2-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card lp-fv2-order-1" style={browserFrame}>
            <BrowserChrome />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/f-radar.jpg"
              alt="Radar de vagas earlyCV"
              width={1100}
              height={764}
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </div>
          <div className="reveal-card lp-fv2-order-2">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>ENCONTRE ANTES</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 400,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Encontre a vaga certa{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                antes
              </em>{" "}
              da multidão.
            </h3>
            <p
              style={{
                fontSize: 15.6,
                lineHeight: 1.65,
                fontWeight: 300,
                color: "#5c5a52",
                margin: "0 0 20px",
                maxWidth: 420,
              }}
            >
              O Radar acompanha direto as páginas de carreira das empresas e
              encontra oportunidades compatíveis com o seu perfil. Quando uma
              vaga relevante aparece, você pode descobrir antes de ela ganhar
              dezenas ou centenas de candidatos nos grandes portais.
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(198,255,58,0.14)",
                border: "1px solid rgba(198,255,58,0.4)",
                borderRadius: 10,
                padding: "12px 16px",
                fontSize: 14,
                fontWeight: 400,
                color: "#0a0a0a",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#7a9e00",
                  flexShrink: 0,
                }}
              />
              Você envia seu CV uma vez. O Radar continua procurando.
            </div>
            <div>
              <Link href="/radar" style={{ ...btnGhost, paddingLeft: 0 }}>
                Explorar vagas abertas →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* PROVA DE VALOR DO RADAR — mesma etapa, não um passo novo */}
      <section style={{ padding: "40px 32px 72px" }}>
        <div
          className="lp-fv2-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card">
            <h3
              style={{
                fontSize: "clamp(22px, 3vw, 30px)",
                fontWeight: 400,
                letterSpacing: -0.7,
                lineHeight: 1.2,
                margin: "0 0 16px",
              }}
            >
              Quando ela aparece nos grandes portais, você{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                já
              </em>{" "}
              pode ter se candidatado.
            </h3>
            <p
              style={{
                fontSize: 15.6,
                lineHeight: 1.65,
                fontWeight: 300,
                color: "#5c5a52",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              A mesma vaga, dois momentos: publicada direto na fonte e
              encontrada pelo Radar — ou chegando depois aos grandes
              agregadores. Chegar cedo significa entrar na fila antes de
              dezenas de outros candidatos.
            </p>
            <Link href="/radar" style={{ ...btnGhost, paddingLeft: 0 }}>
              Ver como o Radar te coloca na frente →
            </Link>
          </div>
          <div className="reveal-card">
            <div
              className="lp-fv2-mini-timeline"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 6,
                marginBottom: 22,
                fontFamily: MONO,
                fontSize: 13,
                letterSpacing: 0.3,
                color: "#8a8a85",
                textTransform: "uppercase",
                maxWidth: 440,
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {[
                "Radar encontra",
                "Você recebe",
                "Você se candidata",
                "Dias depois, aparece nos grandes portais",
              ].map((step, i, arr) => (
                <span
                  key={step}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {step}
                  {i < arr.length - 1 && (
                    <span style={{ color: "#c4c3bd" }}>→</span>
                  )}
                </span>
              ))}
            </div>
            <LinkedInVsRadarMock />
          </div>
        </div>
      </section>

      <JourneyDivider step="01">
        Encontrou uma oportunidade? Agora descubra o quanto ela realmente
        combina com você.
      </JourneyDivider>

      {/* DEEP FEATURE 2 — Análise + CV adaptado */}
      <section style={{ padding: "0 32px 72px" }}>
        <div
          className="lp-fv2-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>ENTENDA E AJUSTE</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 400,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Veja onde seu CV{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                encaixa
              </em>
              . E ajuste o que realmente importa.
            </h3>
            <p
              style={{
                fontSize: 15.6,
                lineHeight: 1.65,
                fontWeight: 300,
                color: "#5c5a52",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              Compare seu currículo com aquela vaga ponto a ponto. O EarlyCV
              mostra onde você tem aderência, o que está pouco evidente e o
              que vale destacar antes de se candidatar. Depois, transforma
              esse diagnóstico em uma versão direcionada à oportunidade, sem
              inventar experiências.
            </p>
            <Link
              href="/demo-resultado"
              style={{ ...btnGhost, paddingLeft: 0, marginBottom: 24 }}
            >
              Ver uma análise completa →
            </Link>
            <div
              style={{
                borderTop: "1px solid rgba(10,10,10,0.08)",
                paddingTop: 20,
                maxWidth: 420,
              }}
            >
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#0a0a0a",
                  margin: "0 0 4px",
                }}
              >
                Já encontrou uma vaga por conta própria? Comece daqui.
              </p>
              <p
                style={{
                  fontSize: 13.5,
                  lineHeight: 1.6,
                  fontWeight: 300,
                  color: "#8a8a85",
                  margin: 0,
                }}
              >
                Cole a descrição da vaga e analise seu currículo diretamente.
              </p>
            </div>
          </div>
          <div className="reveal-card" style={browserFrame}>
            <BrowserChrome />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/f-resultado.jpg"
              alt="Score ATS earlyCV"
              width={950}
              height={660}
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </div>
        </div>
      </section>

      <JourneyDivider step="02">
        Entendeu a oportunidade e preparou seu currículo. Agora é hora de se
        candidatar.
      </JourneyDivider>

      {/* DEEP FEATURE 3 — Candidatura */}
      <section style={{ padding: "0 32px 110px" }}>
        <div
          className="lp-fv2-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>CANDIDATURA</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 400,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Encontrou a vaga certa?{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Candidate-se
              </em>{" "}
              com tudo preparado.
            </h3>
            <p
              style={{
                fontSize: 15.6,
                lineHeight: 1.65,
                fontWeight: 300,
                color: "#5c5a52",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              Com a vaga e o currículo já trabalhados, o EarlyCV mantém o
              restante da candidatura no mesmo contexto: CV adaptado, carta de
              apresentação quando necessária e acompanhamento do processo.
            </p>
            <a href="#como-funciona" style={{ ...btnGhost, paddingLeft: 0 }}>
              Ver como funciona →
            </a>
          </div>
          <div
            className="reveal-card"
            style={{ ...browserFrame, background: "#0a0a0a", padding: 36 }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {[
                {
                  title: "CV adaptado",
                  sub: "ajustado pra essa vaga",
                  icon: (
                    <>
                      <path d="M6 2h9l5 5v15H6z" />
                      <path d="M9 13l2 2 4-4" />
                    </>
                  ),
                },
                {
                  title: "Carta de apresentação",
                  sub: "gerada pra essa vaga",
                  icon: (
                    <>
                      <path d="M4 4h16v16H4z" />
                      <path d="M4 4l8 8 8-8" />
                    </>
                  ),
                },
                {
                  title: "Acompanhamento",
                  sub: "de todas as suas candidaturas",
                  icon: (
                    <>
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M3 9h18M8 14h3" />
                    </>
                  ),
                },
              ].map((item, i, arr) => (
                <div key={item.title}>
                  <div
                    style={{
                      background: "rgba(250,250,246,0.06)",
                      border: "1px solid rgba(250,250,246,0.1)",
                      borderRadius: 12,
                      padding: 18,
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#c6ff3a"
                      strokeWidth="1.6"
                    >
                      <title>{item.title}</title>
                      {item.icon}
                    </svg>
                    <div>
                      <div
                        style={{
                          color: "#fafaf6",
                          fontSize: 14,
                          fontWeight: 400,
                        }}
                      >
                        {item.title}
                      </div>
                      <div style={{ color: "#8a8a85", fontSize: 12 }}>
                        {item.sub}
                      </div>
                    </div>
                  </div>
                  {i < arr.length - 1 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        padding: "6px 0",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#4a4a46"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>então</title>
                        <path d="M12 5v14M6 13l6 6 6-6" />
                      </svg>
                    </div>
                  )}
                </div>
              ))}
              <div
                style={{
                  textAlign: "center",
                  fontFamily: MONO,
                  fontSize: 10.7,
                  letterSpacing: 0.6,
                  color: "#6a6a66",
                  textTransform: "uppercase",
                  paddingTop: 4,
                }}
              >
                grátis após desbloquear a vaga
              </div>
            </div>
          </div>
        </div>
      </section>

      <JourneyDivider step="03">
        A candidatura foi enviada. Se a entrevista vier, você já chega
        pronto.
      </JourneyDivider>

      {/* DEEP FEATURE 4 — Preparação para Entrevista */}
      <section style={{ padding: "0 32px 72px" }}>
        <div
          className="lp-fv2-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>DA CANDIDATURA À ENTREVISTA</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 400,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Se a entrevista vier, você não começa{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                do zero
              </em>
              .
            </h3>
            <p
              style={{
                fontSize: 15.6,
                lineHeight: 1.65,
                fontWeight: 300,
                color: "#5c5a52",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              A vaga, o currículo enviado e os pontos de aderência já fazem
              parte daquela candidatura. O EarlyCV usa esse contexto para
              preparar perguntas prováveis, pontos da sua experiência para
              explorar e uma estratégia específica para aquela entrevista.
            </p>
            <div
              className="lp-fv2-mini-timeline"
              style={{
                display: "flex",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
                fontFamily: MONO,
                fontSize: 13,
                letterSpacing: 0.3,
                color: "#8a8a85",
                textTransform: "uppercase",
                maxWidth: 420,
              }}
            >
              {[
                "Candidatura",
                "Entrevista marcada",
                "Preparação personalizada",
              ].map((step, i, arr) => (
                <span
                  key={step}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {step}
                  {i < arr.length - 1 && (
                    <span style={{ color: "#c4c3bd" }}>→</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="reveal-card" style={browserFrame}>
            <BrowserChrome />
            <InterviewPrepMock />
          </div>
        </div>
      </section>

      <JourneyDivider step="04">
        E cada processo, com resposta positiva ou não, vira contexto pro
        próximo.
      </JourneyDivider>

      {/* DEEP FEATURE 5 — Aprendizado entre candidaturas */}
      <section style={{ padding: "0 32px 72px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center" }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>A PRÓXIMA COMEÇA MELHOR</SectionLabel>
          </div>
          <h3
            style={{
              fontSize: "clamp(24px, 3.2vw, 32px)",
              fontWeight: 400,
              letterSpacing: -0.8,
              margin: "0 0 16px",
            }}
          >
            Cada candidatura deixa{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              aprendizado
            </em>{" "}
            para a próxima.
          </h3>
          <p
            style={{
              fontSize: 15.6,
              lineHeight: 1.65,
              fontWeight: 300,
              color: "#5c5a52",
              margin: "0 auto 28px",
              maxWidth: 520,
            }}
          >
            Registre resultados e feedbacks dos processos. Esse histórico
            adiciona contexto às próximas candidaturas e preparações, para
            que você não recomece do zero a cada nova oportunidade.
          </p>
          <div
            className="lp-fv2-mini-timeline"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexWrap: "wrap",
              gap: 6,
              fontFamily: MONO,
              fontSize: 13,
              letterSpacing: 0.3,
              color: "#8a8a85",
              textTransform: "uppercase",
              maxWidth: 520,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            {["Candidatura", "Resultado / feedback", "Próxima oportunidade"].map(
              (step, i, arr) => (
                <span
                  key={step}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {step}
                  {i < arr.length - 1 && (
                    <span style={{ color: "#c4c3bd" }}>→</span>
                  )}
                </span>
              ),
            )}
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#c4c3bd" }}>→</span>
              <span title="volta pro início da jornada">↺ Radar</span>
            </span>
          </div>
        </div>
      </section>

      <JourneyDivider step="✓" end>
        jornada completa
      </JourneyDivider>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" style={{ padding: "0 32px 110px" }}>
        <div style={container}>
          <div
            className="reveal-card"
            style={{ textAlign: "center", marginBottom: 40 }}
          >
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>COMO FUNCIONA</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 4vw, 42px)",
                fontWeight: 400,
                letterSpacing: -1.4,
                margin: 0,
              }}
            >
              Três passos pra{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                mais entrevistas
              </em>
            </h2>
          </div>
          <div
            className="lp-fv2-grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
            }}
          >
            {[
              {
                step: "01",
                title: "Descubra onde você está perdendo pontos",
                body: "Cole o CV e a vaga. Em segundos você recebe o score ATS e o motivo exato de cada perda de ponto.",
                featured: false,
              },
              {
                step: "02",
                title: "Veja exatamente o que precisa mudar",
                body: "Crie sua conta grátis, sem cartão, e receba o CV já reescrito — mais a carta e o roteiro de entrevista pra essa vaga.",
                featured: true,
              },
              {
                step: "03",
                title: "Candidate-se com tudo pronto",
                body: "Baixe o CV em PDF e DOCX, aplique com a carta pronta e acompanhe a candidatura enquanto o Radar continua de olho em novas vagas pra você.",
                featured: false,
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`reveal-card${item.featured ? " how-card-featured" : ""}`}
                style={{
                  background: item.featured ? "#0a0a0a" : "#fafaf6",
                  border: item.featured
                    ? "none"
                    : "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 16,
                  padding: "28px 28px 24px",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 260,
                  boxShadow: item.featured
                    ? "0 28px 60px -20px rgba(10,10,10,0.4)"
                    : "none",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: MONO,
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 22,
                    ...(item.featured
                      ? {
                          background: "#0a0a0a",
                          color: "#c6ff3a",
                          border: "1.5px solid #c6ff3a",
                        }
                      : {
                          background: "#fafaf6",
                          color: "#0a0a0a",
                          border: "1.5px solid #0a0a0a",
                        }),
                  }}
                >
                  {item.step}
                </div>
                <h4
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    letterSpacing: -0.4,
                    margin: "0 0 10px",
                    color: item.featured ? "#fafaf6" : "#0a0a0a",
                  }}
                >
                  {item.title}
                </h4>
                <p
                  style={{
                    fontSize: 13.6,
                    lineHeight: 1.55,
                    color: item.featured ? "#a0a098" : "#6a6a66",
                    margin: 0,
                  }}
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 32,
            }}
          >
            {[0, 1, 2]
              .flatMap((i) => [
                i > 0 && (
                  <div
                    key={`tick-${i}`}
                    style={{
                      width: 28,
                      height: 1,
                      background: "rgba(10,10,10,0.16)",
                    }}
                  />
                ),
                <div
                  key={`dot-${i}`}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#0a0a0a",
                  }}
                />,
              ])
              .filter(Boolean)}
          </div>
        </div>
      </section>

      {/* PROVA SOCIAL */}
      <DepoimentosSection background="#ffffff" />

      {/* FAQ */}
      <section id="faq" style={{ padding: "0 32px 110px" }}>
        <div style={{ ...container, maxWidth: 820 }}>
          <div className="reveal-card">
            <div style={{ marginBottom: 10 }}>
              <SectionLabel>PERGUNTAS FREQUENTES</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.4vw, 34px)",
                fontWeight: 400,
                letterSpacing: -1,
                margin: "0 0 8px",
              }}
            >
              Ainda com dúvida?
            </h2>
          </div>
          <div style={{ marginTop: 24 }}>
            {[
              {
                q: "O earlyCV inventa informação no meu CV?",
                a: "Não. A adaptação reorganiza, destaca e reformula o que já existe no seu currículo — nunca inventa cargo, resultado, tecnologia ou certificação que você não tem.",
              },
              {
                q: "Como funciona o score ATS?",
                a: "Comparamos seu CV com a descrição da vaga e pontuamos de 0 a 100 por seção — experiência, keywords e formatação — mostrando quantos pontos cada ajuste pode render.",
              },
              {
                q: "Preciso criar conta pra ver a análise?",
                a: "Sim. Você envia o CV e cola a vaga sem compromisso; pra ver o resultado completo, basta criar uma conta grátis — sem cartão.",
              },
              {
                q: "O que é o Radar de Oportunidades?",
                a: "Um portal que rastreia vagas de tecnologia direto nas páginas de carreira das empresas — muitas vezes antes delas aparecerem nos grandes agregadores — e calcula sua aderência assim que são publicadas. Você entra uma vez e o Radar continua de olho por você.",
              },
              {
                q: "O Kit de Candidatura tem custo extra?",
                a: "Não. Depois que você desbloqueia o CV adaptado pra uma vaga, a carta de apresentação, a preparação de entrevista e o acompanhamento dessa candidatura saem de graça.",
              },
            ].map((item) => (
              <div
                key={item.q}
                className="reveal-card"
                style={{
                  borderTop: "1px solid rgba(10,10,10,0.08)",
                  padding: "22px 0",
                }}
              >
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 400,
                    letterSpacing: -0.3,
                    color: "#0a0a0a",
                    margin: "0 0 8px",
                  }}
                >
                  {item.q}
                </p>
                <p
                  style={{
                    fontSize: 14.6,
                    lineHeight: 1.6,
                    fontWeight: 300,
                    color: "#5c5a52",
                    margin: 0,
                    maxWidth: 640,
                  }}
                >
                  {item.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ background: "#0a0a0a", padding: "90px 32px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 640 }}
        >
          <h2
            style={{
              fontFamily: SERIF_ITALIC,
              fontStyle: "italic",
              fontSize: "clamp(28px, 4.6vw, 44px)",
              fontWeight: 400,
              color: "#fafaf6",
              letterSpacing: -0.5,
              margin: "0 0 18px",
            }}
          >
            Encontre a vaga cedo. Chegue nela preparado.
          </h2>
          <p style={{ fontSize: 15.1, color: "#a0a098", margin: "0 0 32px" }}>
            Análise grátis, sem cartão — e o Radar sempre de olho em novas vagas
            pra você.
          </p>
          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Link
              href="/adaptar"
              style={{ ...btnPrimary, background: "#fafaf6", color: "#0a0a0a" }}
            >
              Analisar meu CV grátis →
            </Link>
            <Link
              href="/radar"
              style={{
                border: "1px solid rgba(250,250,246,0.22)",
                color: "#fafaf6",
                background: "transparent",
                borderRadius: 10,
                padding: "13px 22px",
                fontSize: 14,
                fontWeight: 400,
                fontFamily: GEIST,
              }}
            >
              Ver o Radar de Oportunidades
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />

      <style>{`
        .lp-fv2-nav-dropdown { position: relative; display: flex; align-items: center; }
        .lp-fv2-nav-dropdown-trigger { display: inline-flex; align-items: center; gap: 5px; line-height: 1; cursor: default; }
        .lp-fv2-nav-dropdown-panel {
          position: fixed; top: 72px; left: 50%; transform: translateX(-50%) scale(0.98);
          transform-origin: top center;
          background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 16px;
          box-shadow: 0 24px 48px -12px rgba(10,10,10,0.2);
          padding: 22px; display: flex; flex-direction: column; gap: 6px; min-width: 620px;
          opacity: 0; pointer-events: none; transition: opacity 140ms ease, transform 140ms ease;
        }
        .lp-fv2-nav-dropdown-panel::before {
          content: ""; position: absolute; left: 0; right: 0; top: -32px; height: 32px;
        }
        .lp-fv2-nav-dropdown:hover .lp-fv2-nav-dropdown-panel,
        .lp-fv2-nav-dropdown:focus-within .lp-fv2-nav-dropdown-panel {
          opacity: 1; pointer-events: auto; transform: translateX(-50%) scale(1);
        }
        .lp-fv2-nav-dropdown-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 18px; }
        .lp-fv2-nav-dropdown-item {
          display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px; border-radius: 12px;
        }
        .lp-fv2-nav-dropdown-item:hover { background: #f7f7f4; }
        .lp-fv2-nav-dropdown-icon {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px;
          background: rgba(198,255,58,0.24); display: flex; align-items: center; justify-content: center;
        }
        .lp-fv2-nav-dropdown-label { display: block; font-size: 13.5px; font-weight: 500; color: #0a0a0a; white-space: nowrap; }
        .lp-fv2-nav-dropdown-desc { display: block; font-size: 12px; color: #8a8a85; margin-top: 3px; line-height: 1.4; }
        .lp-fv2-nav-dropdown-cta-row { display: flex; justify-content: center; border-top: 1px solid rgba(10,10,10,0.06); padding-top: 16px; }
        .lp-fv2-nav-dropdown-cta {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: #0a0a0a; color: #fff; font-size: 13.5px; font-weight: 500;
          border-radius: 10px; padding: 11px 22px;
        }
        .lp-fv2-kicker {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: ${MONO}; font-size: 10.5px; letter-spacing: 1.2px; font-weight: 500;
          color: #555; background: rgba(10,10,10,0.04); border: 1px solid rgba(10,10,10,0.06);
          padding: 6px 10px; border-radius: 999px;
        }
        .lp-f-pill-row { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
        .lp-f-pill {
          display: inline-flex; align-items: center; gap: 8px; font-family: ${GEIST};
          font-size: 13.5px; font-weight: 500; color: #45443e; background: #fff;
          border: 1px solid rgba(10,10,10,0.1); border-radius: 999px; padding: 10px 16px 10px 14px;
        }
        .lp-f-pill.is-active { background: #0a0a0a; color: #fff; border-color: #0a0a0a; }

        .lp-fv2-marquee-mask {
          width: 100%; overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        }
        .lp-fv2-marquee-track { display: flex; align-items: center; gap: 14px; width: max-content; animation: lp-fv2-marquee-scroll 70s linear infinite; }
        .lp-fv2-marquee-track:hover { animation-play-state: paused; }
        @keyframes lp-fv2-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-25%); } }
        .lp-fv2-company-badge { flex-shrink: 0; padding: 0 22px; }
        .lp-fv2-company-badge span { font-family: ${GEIST}; font-size: 16px; font-weight: 500; letter-spacing: -0.2px; color: #6a6a66; white-space: nowrap; }

        /* Scroll reveal — matches current landing */
        .reveal-card { opacity: 0; transform: translateY(24px); transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94); }
        .reveal-card.reveal-visible { opacity: 1; transform: translateY(0); }
        .how-card-featured { transform: translateY(18px); }
        .how-card-featured.reveal-visible { transform: translateY(-6px); }

        @media (max-width: 900px) {
          .lp-fv2-grid-2 { grid-template-columns: 1fr !important; }
          .lp-fv2-grid-3 { grid-template-columns: 1fr !important; }
          .lp-fv2-order-1 { order: 1; }
          .lp-fv2-order-2 { order: 2; }
        }
        @media (max-width: 640px) {
          .reveal-card { transform: translateX(24px); }
          .reveal-card.reveal-visible { transform: translateX(0); }
          .lp-fv2-step-name { display: none; }
        }
      `}</style>

      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static structured data
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "earlyCV",
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: siteConfig.siteUrl,
              description:
                "Encontre vagas de tecnologia direto na fonte, ajuste seu currículo pra cada uma com IA e acompanhe sua candidatura até a entrevista.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "BRL",
                description: "Análise gratuita disponível",
              },
            },
          ]),
        }}
      />
    </main>
  );
}
