import Link from "next/link";
import { Logo } from "@/components/logo";
import { PublicFooter } from "@/components/public-footer";
import { siteConfig } from "@/lib/site";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { FeatureShowcase } from "./_feature-showcase";
import { FEATURE_PAGES } from "./_shared";
import { GuestAnalysisWidget } from "./guest-analysis-widget";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const COMPANIES = [
  "Itaú",
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
  fontWeight: 500,
  letterSpacing: 1.4,
  textTransform: "uppercase",
  color: "#8a8a85",
};

const btnPrimary: React.CSSProperties = {
  background: "#0a0a0a",
  color: "#fff",
  borderRadius: 10,
  padding: "14px 22px",
  fontSize: 14.5,
  fontWeight: 500,
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
  fontWeight: 500,
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

export function LandingVariantF({
  guestAnalysisAuthGateEnabled,
  isAuthenticated,
}: {
  guestAnalysisAuthGateEnabled: boolean;
  isAuthenticated: boolean;
}) {
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
          position: "sticky",
          top: 0,
          zIndex: 20,
          background: "rgba(255,255,255,0.9)",
          backdropFilter: "blur(6px)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
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
              fontWeight: 500,
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
          <div className="lp-f-nav-dropdown">
            <span
              className="lp-f-nav-dropdown-trigger"
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
            <div className="lp-f-nav-dropdown-panel">
              <div className="lp-f-nav-dropdown-grid">
                {FEATURE_PAGES.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="lp-f-nav-dropdown-item"
                  >
                    <span className="lp-f-nav-dropdown-icon">
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
                        <title>{p.label}</title>
                        <path d={p.icon} />
                      </svg>
                    </span>
                    <span>
                      <span className="lp-f-nav-dropdown-label">{p.label}</span>
                      <span className="lp-f-nav-dropdown-desc">
                        {p.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
              <div className="lp-f-nav-dropdown-cta-row">
                <Link href="/adaptar" className="lp-f-nav-dropdown-cta">
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
            <Link href="/entrar?tab=entrar" style={{ fontSize: 13, color: "#3a3a38" }}>
              Entrar
            </Link>
          )}
          <Link
            href={isAuthenticated ? "/meu-perfil" : "/entrar?tab=cadastro"}
            className="lp-f-nav-profile"
            style={{
              ...btnPrimary,
              padding: "0 16px",
              height: 34,
              borderRadius: 8,
              fontSize: 12.5,
            }}
          >
            {isAuthenticated ? "Meu Perfil" : "Criar conta"}
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ padding: "76px 32px 0" }}>
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
          <div className="lp-f-kicker" style={{ marginBottom: 26 }}>
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
            ANÁLISE GRÁTIS · RESULTADO IMEDIATO
          </div>

          <h1
            style={{
              fontSize: "clamp(34px, 6.4vw, 60px)",
              fontWeight: 500,
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
              color: "#45443e",
              margin: "0 0 32px",
              maxWidth: 560,
            }}
          >
            Você está sendo filtrado antes de alguém ler. A gente ajusta seu CV
            pra vaga em segundos e te avisa das vagas certas assim que elas
            saem.
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

          <div id="tudo-que-voce-precisa">
            <SectionLabel>TUDO QUE VOCÊ PRECISA PRA SER CHAMADO</SectionLabel>
          </div>

          <FeatureShowcase />
        </div>
      </section>

      {/* LOGO WALL — continuous marquee */}
      <section style={{ padding: "72px 0 88px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", marginBottom: 28 }}
        >
          <SectionLabel>QUEM TEM VAGA NO RADAR AGORA</SectionLabel>
        </div>
        <div className="lp-f-marquee-mask reveal-card">
          <div className="lp-f-marquee-track">
            {COMPANIES.map((name) => (
              <div className="lp-f-company-badge" key={name}>
                <span>{name}</span>
              </div>
            ))}
            {COMPANIES.map((name) => (
              <div
                className="lp-f-company-badge"
                key={`dup-${name}`}
                aria-hidden
              >
                <span>{name}</span>
              </div>
            ))}
          </div>
        </div>
        <p
          className="reveal-card"
          style={{
            ...container,
            textAlign: "center",
            fontSize: 12.5,
            color: "#8a8a85",
            marginTop: 22,
          }}
        >
          e mais de 5.000 vagas de tech mapeadas pelo Radar agora mesmo.
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
                fontWeight: 500,
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
              style={{ fontSize: 15, color: "#45443e", margin: "0 0 28px" }}
            >
              <strong style={{ color: "#0a0a0a" }}>32% de ganho médio</strong>{" "}
              de aderência à vaga já no primeiro ajuste.
            </p>
          </div>

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
              fontWeight: 500,
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

      {/* FEATURE STRIP */}
      <section style={{ padding: "0 32px 88px" }}>
        <div style={container}>
          <div className="reveal-card" style={{ marginBottom: 10 }}>
            <SectionLabel>CADA FRENTE, EM DETALHE</SectionLabel>
          </div>
          <h2
            className="reveal-card"
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: "0 0 32px",
              maxWidth: 640,
            }}
          >
            Da vaga certa ao CV certo — sem trocar de ferramenta.
          </h2>
          <div
            className="lp-f-grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
            }}
          >
            <div className="lp-f-feature-tile reveal-card">
              <div className="lp-f-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/f-tile-diagnostico.jpg"
                  alt="Score ATS earlyCV"
                  width={700}
                  height={610}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: -0.2,
                    marginBottom: 4,
                  }}
                >
                  Diagnóstico de CV
                </div>
                <div
                  style={{ fontSize: 13, color: "#6a6a66", lineHeight: 1.45 }}
                >
                  Score ATS, keywords e lacunas — vaga por vaga.
                </div>
              </div>
            </div>
            <div className="lp-f-feature-tile reveal-card">
              <div className="lp-f-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/landing/f-tile-radar.jpg"
                  alt="Aderência à vaga earlyCV"
                  width={700}
                  height={448}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: -0.2,
                    marginBottom: 4,
                  }}
                >
                  Radar de vagas
                </div>
                <div
                  style={{ fontSize: 13, color: "#6a6a66", lineHeight: 1.45 }}
                >
                  Vagas em tech assim que abrem, com aderência calculada pro seu
                  perfil.
                </div>
              </div>
            </div>
            <div className="lp-f-feature-tile reveal-card">
              <div
                className="lp-f-thumb"
                style={{
                  background: "#0a0a0a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="56"
                  height="56"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c6ff3a"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Kit de Candidatura</title>
                  <path d="M4 4h16v14H7l-3 3V4z" />
                  <path d="M8 9h8M8 12.5h5" />
                </svg>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    letterSpacing: -0.2,
                    marginBottom: 4,
                  }}
                >
                  Kit de Candidatura
                </div>
                <div
                  style={{ fontSize: 13, color: "#6a6a66", lineHeight: 1.45 }}
                >
                  Carta de apresentação e preparação de entrevista, geradas de
                  graça pra vaga que você destravou.
                </div>
              </div>
            </div>
          </div>
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
                    fontWeight: 500,
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
                    fontSize: 10.5,
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

      {/* DEEP FEATURE 1 — Diagnóstico */}
      <section style={{ padding: "100px 32px" }}>
        <div
          className="lp-f-grid-2"
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
              <SectionLabel>DIAGNÓSTICO DE CV</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Veja exatamente{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                por que
              </em>{" "}
              seu CV está sendo eliminado.
            </h3>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              Cole a vaga, envie seu CV e receba um score ATS de 0 a 100 com o
              breakdown por seção — experiência, keywords e formatação — e o
              ganho de pontos possível em cada ajuste.
            </p>
            <Link
              href="/demo-resultado"
              style={{ ...btnGhost, paddingLeft: 0 }}
            >
              Ver uma análise completa →
            </Link>
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

      {/* DEEP FEATURE 2 — Radar */}
      <section id="radar" style={{ padding: "0 32px 100px" }}>
        <div
          className="lp-f-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card lp-f-order-1" style={browserFrame}>
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
          <div className="reveal-card lp-f-order-2">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>RADAR DE VAGAS</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Vagas em tech{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                antes
              </em>{" "}
              de todo mundo.
            </h3>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              Envie seu CV uma vez e a gente rastreia vagas novas direto na
              fonte, calcula sua aderência por área, senioridade e tecnologias,
              e te avisa assim que elas aparecem — não quando já têm 300
              candidatos.
            </p>
            <Link href="/radar" style={{ ...btnGhost, paddingLeft: 0 }}>
              Explorar vagas abertas →
            </Link>
          </div>
        </div>
      </section>

      {/* DEEP FEATURE 3 — Kit de Candidatura */}
      <section style={{ padding: "0 32px 110px" }}>
        <div
          className="lp-f-grid-2"
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
              <SectionLabel>KIT DE CANDIDATURA</SectionLabel>
            </div>
            <h3
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Depois do CV, o resto{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                vem junto
              </em>
              .
            </h3>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              Ao destravar seu CV pra uma vaga, você ganha de graça uma carta de
              apresentação personalizada, um roteiro de preparação pra
              entrevista e acompanhamento de todas as suas candidaturas num só
              lugar.
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
                  title: "Preparação de entrevista",
                  sub: "perguntas prováveis + roteiro",
                  icon: (
                    <>
                      <path d="M12 2a5 5 0 015 5v3a5 5 0 01-10 0V7a5 5 0 015-5z" />
                      <path d="M19 10v1a7 7 0 01-14 0v-1M12 21v-4" />
                    </>
                  ),
                },
                {
                  title: "Gestão de candidaturas",
                  sub: "todas as vagas num só lugar",
                  icon: (
                    <>
                      <rect x="3" y="4" width="18" height="16" rx="2" />
                      <path d="M3 9h18M8 14h3" />
                    </>
                  ),
                },
              ].map((item) => (
                <div
                  key={item.title}
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
                        fontWeight: 500,
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ color: "#8a8a85", fontSize: 12 }}>
                      {item.sub}
                    </div>
                  </div>
                </div>
              ))}
              <div
                style={{
                  textAlign: "center",
                  fontFamily: MONO,
                  fontSize: 10.5,
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
                fontWeight: 500,
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
            className="lp-f-grid-3"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3,1fr)",
              gap: 20,
            }}
          >
            {[
              {
                step: "01",
                title: "Envie seu CV e a vaga",
                body: "Cole o PDF do seu currículo e a descrição da vaga — funciona com PDF, DOC ou DOCX.",
                featured: false,
              },
              {
                step: "02",
                title: "Crie sua conta e veja o que ajustar",
                body: "A IA compara seu CV com a vaga e aponta lacunas, keywords e pontuação ATS — grátis, sem cartão.",
                featured: true,
              },
              {
                step: "03",
                title: "Baixe seu CV pronto pra aplicar",
                body: "Receba o CV reescrito em PDF e DOCX — mais carta e preparação de entrevista, de graça.",
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
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.4,
                    color: item.featured ? "#a0a098" : "#8a8a85",
                    marginBottom: 22,
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    width: 32,
                    height: 1,
                    background: item.featured
                      ? "rgba(198,255,58,0.6)"
                      : "rgba(10,10,10,0.12)",
                    marginBottom: 22,
                  }}
                />
                <h4
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: -0.4,
                    margin: "0 0 10px",
                    color: item.featured ? "#fafaf6" : "#0a0a0a",
                  }}
                >
                  {item.title}
                </h4>
                <p
                  style={{
                    fontSize: 13.5,
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
        </div>
      </section>

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
                fontWeight: 500,
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
                q: "O que é o Radar de Vagas?",
                a: "Um portal que rastreia vagas de tecnologia direto na fonte e calcula sua aderência assim que elas são publicadas — pra você chegar antes da vaga lotar de candidatos.",
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
                    fontWeight: 500,
                    letterSpacing: -0.3,
                    color: "#0a0a0a",
                    margin: "0 0 8px",
                  }}
                >
                  {item.q}
                </p>
                <p
                  style={{
                    fontSize: 14.5,
                    lineHeight: 1.6,
                    color: "#45443e",
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
            Pare de ser filtrado antes de alguém ler.
          </h2>
          <p style={{ fontSize: 15, color: "#a0a098", margin: "0 0 32px" }}>
            Grátis, sem cartão, resultado em minutos.
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
                fontWeight: 500,
                fontFamily: GEIST,
              }}
            >
              Ver o Radar de Vagas
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />

      <style>{`
        .lp-f-nav-dropdown { position: relative; display: flex; align-items: center; }
        .lp-f-nav-dropdown-trigger { display: inline-flex; align-items: center; gap: 5px; line-height: 1; cursor: default; }
        .lp-f-nav-dropdown-panel {
          position: fixed; top: 72px; left: 50%; transform: translateX(-50%) scale(0.98);
          transform-origin: top center;
          background: #fff; border: 1px solid rgba(10,10,10,0.08); border-radius: 16px;
          box-shadow: 0 24px 48px -12px rgba(10,10,10,0.2);
          padding: 22px; display: flex; flex-direction: column; gap: 6px; min-width: 620px;
          opacity: 0; pointer-events: none; transition: opacity 140ms ease, transform 140ms ease;
        }
        .lp-f-nav-dropdown-panel::before {
          content: ""; position: absolute; left: 0; right: 0; top: -32px; height: 32px;
        }
        .lp-f-nav-dropdown:hover .lp-f-nav-dropdown-panel,
        .lp-f-nav-dropdown:focus-within .lp-f-nav-dropdown-panel {
          opacity: 1; pointer-events: auto; transform: translateX(-50%) scale(1);
        }
        .lp-f-nav-dropdown-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px 18px; }
        .lp-f-nav-dropdown-item {
          display: flex; align-items: flex-start; gap: 14px; padding: 14px 16px; border-radius: 12px;
        }
        .lp-f-nav-dropdown-item:hover { background: #f7f7f4; }
        .lp-f-nav-dropdown-icon {
          flex-shrink: 0; width: 32px; height: 32px; border-radius: 9px;
          background: rgba(198,255,58,0.24); display: flex; align-items: center; justify-content: center;
        }
        .lp-f-nav-dropdown-label { display: block; font-size: 13.5px; font-weight: 500; color: #0a0a0a; white-space: nowrap; }
        .lp-f-nav-dropdown-desc { display: block; font-size: 12px; color: #8a8a85; margin-top: 3px; line-height: 1.4; }
        .lp-f-nav-dropdown-cta-row { display: flex; justify-content: center; border-top: 1px solid rgba(10,10,10,0.06); padding-top: 16px; }
        .lp-f-nav-dropdown-cta {
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          background: #0a0a0a; color: #fff; font-size: 13.5px; font-weight: 500;
          border-radius: 10px; padding: 11px 22px;
        }
        .lp-f-kicker {
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

        .lp-f-marquee-mask {
          width: 100%; overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 10%, #000 90%, transparent);
        }
        .lp-f-marquee-track { display: flex; align-items: center; gap: 14px; width: max-content; animation: lp-f-marquee-scroll 34s linear infinite; }
        .lp-f-marquee-track:hover { animation-play-state: paused; }
        @keyframes lp-f-marquee-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .lp-f-company-badge { flex-shrink: 0; padding: 0 22px; }
        .lp-f-company-badge span { font-family: ${GEIST}; font-size: 16px; font-weight: 500; letter-spacing: -0.2px; color: #6a6a66; white-space: nowrap; }

        .lp-f-feature-tile { background: #fafaf6; border: 1px solid rgba(10,10,10,0.08); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; gap: 14px; }
        .lp-f-thumb {
          border-radius: 10px; overflow: hidden; border: 1px solid rgba(10,10,10,0.06); aspect-ratio: 16/11.5;
          background: #f0efe9; display: flex; align-items: center; justify-content: center; padding: 12px;
        }
        .lp-f-thumb img { width: 100%; height: 100%; object-fit: contain; display: block; }

        /* Scroll reveal — matches current landing */
        .reveal-card { opacity: 0; transform: translateY(24px); transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94); }
        .reveal-card.reveal-visible { opacity: 1; transform: translateY(0); }
        .how-card-featured { transform: translateY(18px); }
        .how-card-featured.reveal-visible { transform: translateY(-6px); }

        @media (max-width: 900px) {
          .lp-f-grid-2 { grid-template-columns: 1fr !important; }
          .lp-f-grid-3 { grid-template-columns: 1fr !important; }
          .lp-f-order-1 { order: 1; }
          .lp-f-order-2 { order: 2; }
        }
        @media (max-width: 640px) {
          .reveal-card { transform: translateX(24px); }
          .reveal-card.reveal-visible { transform: translateX(0); }
          .lp-f-step-name { display: none; }
        }
        @media (max-width: 768px) {
          .lp-f-nav-profile { display: none !important; }
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
                "Adapte seu currículo para cada vaga em segundos e aumente suas chances de passar pelos filtros ATS e ser chamado para entrevista.",
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
