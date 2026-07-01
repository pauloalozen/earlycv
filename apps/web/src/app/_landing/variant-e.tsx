import Link from "next/link";
import React from "react";
import { Logo } from "@/components/logo";
import { siteConfig } from "@/lib/site";
import { AtsWidget } from "../_ats-widget";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { buildPlanCatalog } from "../planos/plan-catalog";
import { CandidaturasSection } from "./variant-e-candidaturas";
import { InterviewPrepSection } from "./variant-e-interview-prep";
import { VariantENavAuth } from "./variant-e-nav-auth";
import { DepoimentosSection } from "./variant-e-testimonials";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const LOGOS = [
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
];

export function LandingVariantE() {
  const plans = buildPlanCatalog(process.env);

  return (
    <main
      style={{
        fontFamily: GEIST,
        color: "#0a0a0a",
        background: "#fff",
        position: "relative",
        overflowX: "hidden",
        paddingTop: 64,
      }}
    >
      {/* ── Nav ── */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0 40px",
          height: 64,
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: "rgba(255,255,255,0.96)",
          backdropFilter: "blur(8px)",
        }}
        className="e-nav"
      >
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
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
          style={{ display: "flex", gap: 28, alignItems: "center" }}
          className="e-nav-links"
        >
          <a
            href="#como-funciona"
            data-text="Como funciona"
            style={{
              fontSize: 13.5,
              color: "#3a3a38",
              fontWeight: 450,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            Como funciona
          </a>
          <a
            href="#candidaturas"
            data-text="Candidaturas"
            style={{
              fontSize: 13.5,
              color: "#3a3a38",
              fontWeight: 450,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            Candidaturas
          </a>
          <a
            href="#precos"
            data-text="Preços"
            style={{
              fontSize: 13.5,
              color: "#3a3a38",
              fontWeight: 450,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            Preços
          </a>
          <Link
            href="/blog"
            data-text="Blog"
            style={{
              fontSize: 13.5,
              color: "#3a3a38",
              fontWeight: 450,
              textDecoration: "none",
              letterSpacing: -0.1,
            }}
          >
            Blog
          </Link>
        </div>

        <VariantENavAuth />
      </nav>

      <LandingScrollAnimations />

      {/* ── Hero ── */}
      <section
        id="hero"
        style={{
          background: "#fff",
          height: "calc(100dvh - 64px)",
          display: "flex",
          flexDirection: "column",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: 64,
        }}
      >
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              maxWidth: 1200,
              margin: "0 auto",
              padding: "48px 40px",
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 80,
              alignItems: "center",
              width: "100%",
            }}
            className="e-hero-grid"
          >
            {/* Left */}
            <div>
              <a
                href="#candidaturas"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: "#0a0a0a",
                  background: "rgba(198,255,58,0.18)",
                  border: "1px solid rgba(110,150,20,0.28)",
                  borderRadius: 999,
                  padding: "6px 12px",
                  marginBottom: 28,
                  textDecoration: "none",
                }}
                className="e-hero-kicker"
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    boxShadow: "0 0 6px #c6ff3a",
                    flexShrink: 0,
                    display: "inline-block",
                  }}
                />
                <span>Novo · candidaturas + entrevistas</span>
                <span style={{ opacity: 0.55 }}>→</span>
              </a>

              <h1
                style={{
                  fontSize: "clamp(40px, 6vw, 68px)",
                  fontWeight: 500,
                  letterSpacing: -2.6,
                  lineHeight: 0.98,
                  margin: "0 0 12px",
                  color: "#0a0a0a",
                }}
                className="e-hero-h1"
              >
                Um CV{" "}
                <em
                  style={{
                    fontFamily: SERIF_ITALIC,
                    fontStyle: "italic",
                    fontWeight: 400,
                    letterSpacing: -1,
                  }}
                >
                  ajustado
                </em>
                <br />
                para cada vaga.
              </h1>
              <p
                style={{
                  fontSize: "clamp(28px, 4vw, 44px)",
                  fontWeight: 400,
                  letterSpacing: -1.4,
                  lineHeight: 1.1,
                  margin: "0 0 28px",
                  color: "#6e6c66",
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                }}
                className="e-hero-subtitle"
              >
                Uma candidatura organizada
                <br />
                até a entrevista.
              </p>

              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.55,
                  color: "#45443e",
                  margin: "0 0 32px",
                  maxWidth: 480,
                  fontWeight: 400,
                }}
                className="e-hero-body"
              >
                Cole seu CV e a vaga. O EarlyCV mostra o que falta, gera uma
                versão mais alinhada, organiza sua candidatura e ajuda você a se
                preparar para a entrevista.
              </p>

              <div
                style={{
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  marginBottom: 52,
                }}
                className="e-hero-cta-row"
              >
                <Link
                  href="/adaptar"
                  style={{
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
                    textDecoration: "none",
                    boxShadow:
                      "0 4px 12px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.08)",
                    transition: "transform 180ms, box-shadow 180ms",
                  }}
                  className="lp-cta-primary"
                >
                  <span className="lp-cta-text-desktop">
                    Adaptar meu CV grátis
                  </span>
                  <span className="lp-cta-text-mobile">Testar grátis</span>
                  <span className="lp-cta-arrow">→</span>
                </Link>
                <Link
                  href="/demo-resultado"
                  style={{
                    background: "transparent",
                    color: "#0a0a0a",
                    fontSize: 14,
                    fontWeight: 500,
                    padding: "14px",
                    textDecoration: "underline",
                    textDecorationColor: "rgba(10,10,10,0.2)",
                    textUnderlineOffset: 4,
                  }}
                >
                  Ver Demo
                </Link>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  paddingTop: 28,
                  borderTop: "1px solid rgba(10,10,10,0.08)",
                }}
                className="e-hero-stats"
              >
                {[
                  { num: "≈90s", label: "ANÁLISE\nCOMPLETA" },
                  { num: "32%", label: "GANHO MÉDIO DE\nADERÊNCIA À VAGA" },
                  { num: "12+", label: "MELHORIAS\nSUGERIDAS POR CV" },
                ].map((item, i) => (
                  <React.Fragment key={item.num}>
                    {i > 0 && (
                      <div
                        style={{
                          width: 1,
                          height: 36,
                          background: "rgba(10,10,10,0.1)",
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 2,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 26,
                          fontWeight: 500,
                          letterSpacing: -1,
                          color: "#0a0a0a",
                          lineHeight: 1,
                        }}
                        className="e-hero-stat-num"
                      >
                        {item.num}
                      </span>
                      <span
                        style={{
                          fontSize: 10.5,
                          color: "#6a6a66",
                          lineHeight: 1.25,
                          fontFamily: MONO,
                          letterSpacing: 0.3,
                          textTransform: "uppercase",
                          whiteSpace: "pre-line",
                        }}
                      >
                        {item.label}
                      </span>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Right — ATS Widget */}
            <div
              className="e-hero-widget"
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <AtsWidget />
            </div>
          </div>
        </div>

        {/* ── Company logos ticker ── */}
        <div
          style={{
            borderTop: "1px solid rgba(10,10,10,0.06)",
            background: "#fafaf8",
            padding: "16px 0",
            display: "flex",
            alignItems: "center",
            gap: 0,
            overflow: "hidden",
          }}
          className="e-logos-bar"
        >
          <span
            className="e-logos-label"
            style={{
              fontFamily: MONO,
              fontSize: 9.5,
              letterSpacing: 1.2,
              color: "#8a8a85",
              fontWeight: 500,
              whiteSpace: "nowrap",
              flexShrink: 0,
              padding: "0 32px",
            }}
          >
            <span className="e-logos-label-desktop">
              USADO POR CANDIDATOS EM PROCESSOS DE EMPRESAS COMO:
            </span>
            <span className="e-logos-label-mobile">
              EMPRESAS DOS NOSSOS CANDIDATOS:
            </span>
          </span>
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <div
              className="e-logos-ticker"
              style={{
                display: "flex",
                alignItems: "center",
                width: "max-content",
              }}
            >
              {[...LOGOS, ...LOGOS, ...LOGOS, ...LOGOS].map((name, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: duplicated list for infinite scroll
                <React.Fragment key={`${name}-${i}`}>
                  <span
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: "#3a3a36",
                      letterSpacing: -0.2,
                      opacity: 0.65,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {name}
                  </span>
                  <span
                    style={{ color: "#d8d6ce", fontSize: 12, margin: "0 14px" }}
                  >
                    ·
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Não pare no currículo pronto ── */}
      <section
        style={{
          background: "#fff",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: 64,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "80px 40px",
            width: "100%",
          }}
        >
          {/* Top row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 60,
              alignItems: "end",
              marginBottom: 60,
            }}
            className="e-notpare-header"
          >
            <div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  background: "#0a0a0a",
                  borderRadius: 999,
                  padding: "6px 14px",
                  marginBottom: 22,
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
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1,
                    color: "#fafaf6",
                    fontWeight: 500,
                  }}
                >
                  DO CV À ENTREVISTA, SEM PLANILHA E SEM IMPROVISO
                </span>
              </div>
              <h2
                style={{
                  fontSize: "clamp(32px, 5vw, 54px)",
                  fontWeight: 500,
                  letterSpacing: -2,
                  lineHeight: 1.0,
                  margin: 0,
                  color: "#0a0a0a",
                }}
              >
                Não pare no{" "}
                <em
                  style={{
                    fontFamily: SERIF_ITALIC,
                    fontStyle: "italic",
                    fontWeight: 400,
                    letterSpacing: -0.5,
                  }}
                >
                  currículo pronto.
                </em>
              </h2>
            </div>
            <p
              style={{
                fontSize: 16,
                lineHeight: 1.65,
                color: "#5a5a55",
                margin: 0,
                maxWidth: 440,
              }}
            >
              A busca por emprego não termina no PDF. Organize cada vaga,
              acompanhe o status e use cada processo para melhorar o próximo.
            </p>
          </div>

          {/* Feature rows */}
          <div>
            {[
              {
                step: "01",
                icon: "≡",
                title: "CV adaptado para a vaga",
                body: "Ajuste seu currículo com base nos requisitos reais da oportunidade. Análise gratuita, score de compatibilidade e sugestões específicas por vaga.",
                tag: "Veja o que falta",
                href: "/adaptar",
              },
              {
                step: "02",
                icon: "⊞",
                title: "Candidaturas organizadas",
                body: "Veja onde aplicou, qual CV usou e o que precisa fazer depois. Status, histórico e próximos passos em um só lugar — sem planilha.",
                tag: "Sem planilha",
                href: "/candidaturas",
              },
              {
                step: "03",
                icon: "◎",
                title: "Preparação para entrevista",
                body: "Receba perguntas prováveis, pontos fortes e alertas antes da conversa. Cada processo te prepara melhor para o próximo.",
                tag: "Antes da conversa",
                href: "/candidaturas",
              },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  display: "grid",
                  gridTemplateColumns: "48px 52px 1fr auto",
                  gap: 20,
                  alignItems: "center",
                  padding: "28px 0",
                  borderTop: "1px solid rgba(10,10,10,0.07)",
                }}
                className="e-notpare-row"
              >
                <span
                  className="e-notpare-step"
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 0.8,
                    color: "#b0aea8",
                    fontWeight: 500,
                  }}
                >
                  {item.step}
                </span>
                <div
                  className="e-notpare-icon"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    border: "1px solid rgba(10,10,10,0.1)",
                    background: "#fafaf8",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                    color: "#3a3a36",
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <div>
                  <div
                    className="e-notpare-title"
                    style={{
                      fontSize: 17,
                      fontWeight: 500,
                      color: "#0a0a0a",
                      letterSpacing: -0.3,
                      marginBottom: 5,
                    }}
                  >
                    {item.title}
                  </div>
                  <p
                    style={{
                      fontSize: 14,
                      color: "#5a5a55",
                      lineHeight: 1.55,
                      margin: 0,
                      maxWidth: 560,
                    }}
                  >
                    {item.body}
                  </p>
                </div>
                <Link
                  href={item.href}
                  className="e-notpare-tag"
                  style={{
                    fontSize: 13,
                    color: "#6a6a66",
                    textDecoration: "none",
                    whiteSpace: "nowrap",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {item.tag} →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Candidaturas (new feature) ── */}
      <CandidaturasSection />

      {/* ── Preparação para entrevista ── */}
      <InterviewPrepSection />

      {/* ── Como funciona ── */}
      <section
        id="como-funciona"
        style={{
          background: "#fafaf8",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: 64,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "80px 40px",
            width: "100%",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(10,10,10,0.03)",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 999,
                padding: "6px 13px",
                marginBottom: 24,
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
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  color: "#555",
                  fontWeight: 500,
                }}
              >
                COMO FUNCIONA
              </span>
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 5.5vw, 44px)",
                fontWeight: 500,
                letterSpacing: -1.8,
                lineHeight: 1.1,
                margin: "0 0 16px",
                color: "#0a0a0a",
              }}
            >
              Três passos para uma{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                  letterSpacing: -0.5,
                }}
              >
                candidatura melhor
              </em>
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 20,
            }}
            className="e-how-grid"
          >
            {[
              {
                step: "01",
                title: "Envie seu CV e a vaga",
                body: "Cole a descrição e o currículo. Funciona com qualquer formato e qualquer vaga. Leva menos de dois minuto.",
                detail: "Upload · Cole a vaga",
                dark: false,
              },
              {
                step: "02",
                title: "Receba análise e CV ajustado",
                body: "Para cada vaga, você descobre o score real, as lacunas e recebe um CV reescrito com os ajustes certos.",
                detail: "Score ATS · adaptações",
                dark: true,
              },
              {
                step: "03",
                title: "Acompanhe e prepare-se",
                body: "Salve a candidatura, acompanhe o status e se prepare para a entrevista com base no que a empresa espera.",
                detail: "CV · DOCX · 1 crédito",
                dark: false,
              },
            ].map((item) => (
              <div
                key={item.step}
                className={`reveal-card${item.dark ? " how-card-featured" : ""}`}
                style={{
                  background: item.dark ? "#0a0a0a" : "#fff",
                  border: item.dark
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid rgba(10,10,10,0.07)",
                  borderRadius: 16,
                  padding: "34px 30px",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 300,
                  boxShadow: item.dark
                    ? "0 24px 50px -22px rgba(10,10,10,0.5)"
                    : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.5,
                    color: item.dark ? "#6a6a60" : "#b0aead",
                    fontWeight: 500,
                    marginBottom: 14,
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    width: 26,
                    height: 1.5,
                    background: item.dark ? "#c6ff3a" : "rgba(10,10,10,0.18)",
                    marginBottom: 26,
                  }}
                />
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 500,
                    letterSpacing: -0.5,
                    color: item.dark ? "#fafaf6" : "#0a0a0a",
                    margin: "0 0 12px",
                    lineHeight: 1.25,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 14.5,
                    color: item.dark ? "#a0a098" : "#5a5a55",
                    lineHeight: 1.6,
                    margin: 0,
                    flex: 1,
                  }}
                >
                  {item.body}
                </p>
                <div
                  style={{
                    marginTop: "auto",
                    paddingTop: 22,
                    borderTop: item.dark
                      ? "1px solid rgba(255,255,255,0.08)"
                      : "1px solid rgba(10,10,10,0.08)",
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 0.5,
                    color: item.dark ? "#7a7a70" : "#a0a09a",
                    paddingBottom: 0,
                  }}
                >
                  {item.detail}
                </div>
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 48 }}>
            <Link
              href="/adaptar"
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 10,
                padding: "14px 22px",
                fontSize: 14,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                letterSpacing: -0.1,
                textDecoration: "none",
                boxShadow:
                  "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
              className="lp-cta-primary"
            >
              Começar agora grátis <span className="lp-cta-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <DepoimentosSection />

      {/* ── Preços ── */}
      <section
        id="precos"
        style={{
          background: "#fff",
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: 64,
        }}
      >
        <div
          style={{
            maxWidth: 1260,
            margin: "0 auto",
            padding: "80px 40px",
            width: "100%",
          }}
        >
          <div
            style={{
              textAlign: "center",
              marginBottom: 60,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(10,10,10,0.03)",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 999,
                padding: "6px 13px",
                marginBottom: 24,
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
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  color: "#555",
                  fontWeight: 500,
                }}
              >
                PREÇOS
              </span>
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 5.5vw, 44px)",
                fontWeight: 500,
                letterSpacing: -1.8,
                lineHeight: 1.05,
                margin: "0 0 12px",
                color: "#0a0a0a",
              }}
            >
              Simples e{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                  letterSpacing: -0.5,
                }}
              >
                sem surpresas
              </em>
            </h2>
            <p
              style={{
                fontSize: 16,
                color: "#5a5a55",
                margin: "0 auto",
                maxWidth: 520,
                lineHeight: 1.6,
              }}
            >
              Análise grátis sempre. Pague só quando quiser gerar CVs adaptados,
              acompanhar candidaturas e se preparar para entrevistas.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              alignItems: "stretch",
            }}
            className="e-pricing-grid"
          >
            {plans.map((plan, i) => (
              <div
                key={plan.id}
                className="reveal-card"
                style={{
                  background: plan.featured ? "#0a0a0a" : "#fafafa",
                  border: plan.featured
                    ? "1px solid rgba(255,255,255,0.06)"
                    : "1px solid rgba(10,10,10,0.09)",
                  borderRadius: 16,
                  padding: "28px 22px",
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: plan.featured
                    ? "0 28px 60px -26px rgba(10,10,10,0.55)"
                    : "none",
                  transitionDelay: `${i * 0.1}s`,
                }}
              >
                {plan.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: -13,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: plan.featured ? "#c6ff3a" : "#0a0a0a",
                      color: plan.featured ? "#0a0a0a" : "#fff",
                      fontFamily: MONO,
                      fontSize: 10.5,
                      fontWeight: 600,
                      padding: "4px 13px",
                      borderRadius: 999,
                      whiteSpace: "nowrap",
                      letterSpacing: 0.3,
                    }}
                  >
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: plan.featured ? "#fafaf6" : "#0a0a0a",
                      marginBottom: 12,
                      letterSpacing: -0.2,
                    }}
                  >
                    {plan.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 1,
                      marginBottom: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 40,
                        fontWeight: 500,
                        letterSpacing: -2,
                        color: plan.featured ? "#fafaf6" : "#0a0a0a",
                        lineHeight: 1,
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 400,
                        color: plan.featured ? "#6a6a60" : "#8a8a85",
                      }}
                    >
                      {plan.cents}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: plan.featured ? "#a0a098" : "#6a6a66",
                      lineHeight: 1.4,
                    }}
                  >
                    {plan.description}
                  </div>
                </div>

                <ul
                  style={{
                    listStyle: "none",
                    margin: "0 0 20px",
                    padding: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 11,
                    flex: 1,
                  }}
                >
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        display: "flex",
                        gap: 9,
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        style={{
                          color: "#7cae18",
                          fontSize: 12,
                          flexShrink: 0,
                          marginTop: 1,
                        }}
                      >
                        ✓
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: plan.featured ? "#c0beb8" : "#3a3a36",
                          lineHeight: 1.45,
                        }}
                      >
                        {f}
                      </span>
                    </li>
                  ))}
                </ul>

                {plan.unitPriceCents && (
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 11,
                      color: plan.featured ? "#6a6a60" : "#9a9a95",
                      marginBottom: 14,
                      letterSpacing: 0.1,
                    }}
                  >
                    Cada crédito EarlyCV custa R${" "}
                    {(plan.unitPriceCents / 100).toFixed(2).replace(".", ",")}
                  </div>
                )}

                <div style={{ marginTop: "auto" }}>
                  {plan.checkoutPlanId ? (
                    <form action="/plans/checkout" method="post">
                      <input
                        type="hidden"
                        name="planId"
                        value={plan.checkoutPlanId}
                      />
                      <button
                        type="submit"
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "center",
                          background: plan.featured ? "#c6ff3a" : "#0a0a0a",
                          color: plan.featured ? "#0a0a0a" : "#fff",
                          borderRadius: 10,
                          padding: "13px",
                          fontSize: 13.5,
                          fontWeight: 600,
                          letterSpacing: -0.1,
                          border: "none",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {plan.cta_lading}
                      </button>
                    </form>
                  ) : (
                    <Link
                      href={plan.cta_link}
                      style={{
                        display: "block",
                        textAlign: "center",
                        background: plan.featured ? "#c6ff3a" : "#0a0a0a",
                        color: plan.featured ? "#0a0a0a" : "#fff",
                        borderRadius: 10,
                        padding: "13px",
                        fontSize: 13.5,
                        fontWeight: 600,
                        textDecoration: "none",
                        letterSpacing: -0.1,
                      }}
                    >
                      {plan.cta_lading}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              marginTop: 24,
              padding: "12px 20px",
              background: "rgba(198,255,58,0.08)",
              border: "1px solid rgba(110,150,20,0.18)",
              borderRadius: 10,
              maxWidth: 760,
              margin: "24px auto 0",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#c6ff3a",
                flexShrink: 0,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "#3a5008",
                lineHeight: 1.4,
              }}
            >
              1 crédito = 1 CV adaptado + preparação de entrevista daquela vaga.
              Organizar candidaturas e análises de CV são grátis.
            </span>
          </div>

          <div style={{ textAlign: "center", marginTop: 20 }}>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                color: "#6a6a66",
                letterSpacing: 0.3,
              }}
            >
              🔒 Pagamento seguro via Mercado Pago · Acesso imediato · Sem
              renovação automática
            </span>
          </div>
        </div>
      </section>

      {/* ── Garantia + Nota do criador ── */}
      <section
        style={{
          background: "#f9f9f7",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          borderTop: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "80px 40px 40px",
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 11,
              letterSpacing: 1.8,
              color: "#9a9a92",
              fontWeight: 500,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Garantia de satisfação
          </div>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 500,
              letterSpacing: -1.7,
              color: "#0a0a0a",
              margin: "0 0 18px",
              lineHeight: 1.08,
            }}
          >
            Não ficou bom?{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              Devolvemos seu dinheiro.
            </em>
          </h2>
          <p
            style={{
              fontSize: 16.5,
              color: "#5a5a55",
              lineHeight: 1.65,
              margin: "0 auto 32px",
              maxWidth: 480,
            }}
          >
            Sem formulário, sem burocracia. Se a adaptação não entregou valor,
            manda uma mensagem e o dinheiro volta.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 28,
              flexWrap: "wrap",
              marginBottom: 40,
            }}
          >
            {[
              "Reembolso integral garantido",
              "Sem perguntas ou burocracia",
            ].map((b) => (
              <div
                key={b}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    boxShadow: "0 0 6px rgba(198,255,58,0.8)",
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: 14,
                    color: "#2a2a28",
                    fontWeight: 500,
                    letterSpacing: -0.1,
                  }}
                >
                  {b}
                </span>
              </div>
            ))}
          </div>
          <Link
            href="/adaptar"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 12,
              padding: "16px 30px",
              fontSize: 15,
              fontWeight: 600,
              textDecoration: "none",
              display: "inline-block",
              letterSpacing: -0.1,
              boxShadow: "0 6px 20px rgba(0,0,0,0.14)",
            }}
            className="lp-cta-primary"
          >
            Testar grátis agora →
          </Link>
        </div>

        <div
          style={{
            maxWidth: 720,
            margin: "0 auto",
            padding: "0 40px 80px",
            textAlign: "left",
            width: "100%",
          }}
        >
          <div
            className="e-creator-card"
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 18,
              padding: "30px 34px",
              display: "flex",
              flexWrap: "wrap",
              columnGap: 22,
              rowGap: 10,
              alignItems: "flex-start",
              boxShadow: "0 4px 24px rgba(10,10,10,0.04)",
            }}
          >
            <img
              src="/paulo-alozen.jpg"
              alt="Paulo Alozen"
              width={52}
              height={52}
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                flexShrink: 0,
                objectFit: "cover",
                border: "1px solid rgba(10,10,10,0.08)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 12,
                  marginBottom: 3,
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    fontSize: 15.5,
                    fontWeight: 600,
                    color: "#0a0a0a",
                    letterSpacing: -0.2,
                  }}
                >
                  Paulo Alozen
                </span>
              </div>
              <div
                className="e-creator-subtitle"
                style={{
                  fontFamily: MONO,
                  fontSize: 11.5,
                  color: "#6a6a66",
                  letterSpacing: 0.2,
                  marginBottom: 0,
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <span style={{ whiteSpace: "nowrap" }}>Criador do EarlyCV</span>
                <a
                  href="https://www.linkedin.com/in/pauloalozen/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: "#5a5a55",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 3,
                    fontFamily: MONO,
                    letterSpacing: 0.3,
                    borderBottom: "1px solid rgba(10,10,10,0.18)",
                    paddingBottom: 1,
                    whiteSpace: "nowrap",
                  }}
                >
                  ↗ LinkedIn
                </a>
              </div>
            </div>
            <p
              className="e-creator-quote"
              style={{
                fontSize: 14.5,
                fontStyle: "italic",
                color: "#45443e",
                lineHeight: 1.65,
                margin: 0,
                maxWidth: 540,
                flexBasis: "100%",
                paddingLeft: 74,
              }}
            >
              &ldquo;Criei o EarlyCV depois de mandar o mesmo currículo para
              vagas diferentes e não passar em nenhuma triagem. Hoje uso essa
              mesma ferramenta para adaptar meu CV a cada vaga que realmente
              me interessa.&rdquo;
            </p>
          </div>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section
        style={{
          background: "#0a0a0a",
          display: "flex",
          alignItems: "center",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div
          style={{
            maxWidth: 780,
            margin: "0 auto",
            padding: "80px 40px",
            textAlign: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.5,
              color: "#4a4a45",
              fontWeight: 500,
              marginBottom: 18,
            }}
          >
            PRONTO PARA COMEÇAR
          </div>
          <h2
            style={{
              fontSize: "clamp(36px, 6vw, 56px)",
              fontWeight: 500,
              letterSpacing: -2.2,
              color: "#fafaf6",
              margin: "0 0 20px",
              lineHeight: 1.02,
            }}
          >
            Seu próximo emprego{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              começa aqui.
            </em>
          </h2>
          <p
            style={{
              fontSize: 17,
              color: "#7a7a74",
              lineHeight: 1.6,
              margin: "0 0 44px",
            }}
          >
            Análise gratuita. Sem cartão de crédito. Em 90 segundos você já sabe
            o que falta.
          </p>
          <div
            className="e-cta-final-btns"
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Link
              href="/adaptar"
              style={{
                background: "#c6ff3a",
                color: "#0a0a0a",
                borderRadius: 10,
                padding: "15px 28px",
                fontSize: 15,
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                letterSpacing: -0.2,
                boxShadow: "0 4px 20px rgba(198,255,58,0.20)",
                transition: "transform 180ms, box-shadow 180ms",
              }}
              className="lp-cta-lime"
            >
              Adaptar meu CV agora <span className="lp-cta-arrow">→</span>
            </Link>
            <Link
              href="/demo-resultado"
              style={{
                background: "transparent",
                color: "#7a7a74",
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 10,
                padding: "15px 24px",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              Ver Demo
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          background: "#0a0a0a",
          borderTop: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* CTA strip */}
          <div
            style={{
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              padding: "36px 40px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
            className="e-footer-strip"
          >
            <div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 500,
                  color: "#fafaf6",
                  letterSpacing: -0.6,
                  marginBottom: 4,
                }}
              >
                Pronto para melhorar seu currículo?
              </div>
              <div style={{ fontSize: 13.5, color: "#4a4a48" }}>
                Comece grátis. Sem cartão de crédito.
              </div>
            </div>
            <Link
              href="/adaptar"
              style={{
                background: "#fafaf6",
                color: "#0a0a0a",
                borderRadius: 8,
                padding: "11px 18px",
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              Adaptar meu CV →
            </Link>
          </div>

          {/* Links grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 40,
              padding: "40px 40px 32px",
            }}
            className="e-footer-grid"
          >
            {[
              {
                label: "PRODUTO",
                links: [
                  { text: "Análise gratuita", href: "/adaptar" },
                  { text: "Adaptar currículo", href: "/adaptar" },
                  { text: "Rastreador de candidaturas", href: "/candidaturas" },
                  { text: "Ver exemplo ao vivo", href: "/demo-resultado" },
                ],
              },
              {
                label: "PLANOS",
                links: [
                  { text: "Free", href: "/planos" },
                  { text: "Starter", href: "/planos" },
                  { text: "Pro", href: "/planos" },
                  { text: "Turbo", href: "/planos" },
                ],
              },
              {
                label: "RECURSOS",
                links: [
                  { text: "Blog", href: "/blog" },
                  { text: "Demo de resultado", href: "/demo-resultado" },
                  { text: "Contato", href: "/contato" },
                ],
              },
              {
                label: "LEGAL",
                links: [
                  { text: "Privacidade", href: "/privacidade" },
                  { text: "Termos de uso", href: "/termos-de-uso" },
                ],
              },
            ].map((col) => (
              <div key={col.label}>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: "#5a5a55",
                    fontWeight: 500,
                    marginBottom: 14,
                  }}
                >
                  {col.label}
                </div>
                {col.links.map((l) => (
                  <div key={l.text} style={{ marginBottom: 10 }}>
                    <Link
                      href={l.href}
                      style={{
                        fontSize: 13.5,
                        color: "#6a6a62",
                        textDecoration: "none",
                        lineHeight: 1.4,
                      }}
                    >
                      {l.text}
                    </Link>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Bottom bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "16px 40px",
              borderTop: "1px solid rgba(255,255,255,0.04)",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#3a3a38",
                letterSpacing: 0.3,
              }}
            >
              Dados protegidos conforme LGPD
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#3a3a38",
                letterSpacing: 0.3,
              }}
            >
              EarlyCV © {new Date().getFullYear()}
            </span>
          </div>
        </div>
      </footer>

      {/* CSS */}
      <style>{`
        html { scroll-behavior: smooth; }

        /* Nav link hover */
        .e-nav-links a {
          position: relative;
        }
        .e-nav-links a::after {
          content: '';
          position: absolute;
          bottom: -3px;
          left: 0;
          right: 0;
          height: 2px;
          background: #3a3a38;
          border-radius: 1px;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 260ms cubic-bezier(.25,.46,.45,.94);
        }
        .e-nav-links a:hover::after { transform: scaleX(1); }

        /* Logos ticker */
        @keyframes eLogosTicker {
          from { transform: translateX(0); }
          to { transform: translateX(-25%); }
        }
        .e-logos-ticker {
          animation: eLogosTicker 36s linear infinite;
        }
        .e-logos-ticker:hover { animation-play-state: paused; }

        /* "Não pare" row hover */
        .e-notpare-row {
          position: relative;
          transition: transform 200ms cubic-bezier(.25,.46,.45,.94), background 200ms ease;
          cursor: pointer;
        }
        .e-notpare-row::before {
          content: '';
          position: absolute;
          left: -14px;
          top: 0;
          bottom: 0;
          width: 3px;
          background: #c6ff3a;
          border-radius: 0 2px 2px 0;
          opacity: 0;
          transition: opacity 200ms ease;
        }
        .e-notpare-row:hover {
          transform: translateX(10px);
          background: rgba(198,255,58,0.04) !important;
        }
        .e-notpare-row:hover::before { opacity: 1; }
        .e-notpare-icon { transition: background 200ms ease, border-color 200ms ease, color 200ms ease; }
        .e-notpare-row:hover .e-notpare-icon {
          background: #c6ff3a !important;
          border-color: #c6ff3a !important;
          color: #0a0a0a !important;
        }
        .e-notpare-title { transition: font-weight 0ms; }
        .e-notpare-row:hover .e-notpare-title { font-weight: 600 !important; }
        .e-notpare-tag {
          transition: background 200ms ease, color 200ms ease, border-color 200ms ease;
          border: 1px solid transparent;
          border-radius: 999px;
          padding: 4px 12px;
        }
        .e-notpare-row:hover .e-notpare-tag {
          background: rgba(198,255,58,0.25) !important;
          color: #3a6008 !important;
          border-color: rgba(110,150,20,0.3) !important;
        }

        .lp-cta-text-mobile { display: none; }
        .e-logos-label-mobile { display: none; }
        @media (max-width: 768px) {
          .lp-cta-text-desktop { display: none; }
          .lp-cta-text-mobile { display: inline; }
        }

        .lp-cta-primary { transition: transform 180ms, box-shadow 180ms !important; }
        .lp-cta-primary:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08) !important;
        }
        .lp-cta-lime { transition: transform 180ms, box-shadow 180ms !important; }
        .lp-cta-lime:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 8px 32px rgba(198,255,58,0.35) !important;
        }
        .lp-cta-arrow { display: inline-block; transition: transform 240ms cubic-bezier(.3,.9,.4,1); }
        .lp-cta-primary:hover .lp-cta-arrow,
        .lp-cta-lime:hover .lp-cta-arrow { transform: translateX(4px); }

        /* Scroll reveal */
        .reveal-card {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94);
        }
        .reveal-card.reveal-visible { opacity: 1; transform: translateY(0); }
        .how-card-featured { transform: translateY(18px); }
        .how-card-featured.reveal-visible { transform: translateY(-6px); }
        @media (max-width: 768px) {
          .reveal-card { transform: translateX(24px); }
          .reveal-card.reveal-visible { transform: translateX(0); }
          .how-card-featured { transform: translateX(24px); }
          .how-card-featured.reveal-visible { transform: translateX(0); }
        }

        /* Responsive */
        @media (max-width: 900px) {
          .e-hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .e-how-grid { grid-template-columns: 1fr !important; }
          .e-pricing-grid { grid-template-columns: 1fr 1fr !important; }
          .e-candidaturas-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .e-depoimentos-grid { grid-template-columns: 1fr !important; }
          .e-footer-grid { grid-template-columns: 1fr 1fr !important; }
          .e-prep-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .e-notpare-header { grid-template-columns: 1fr !important; gap: 20px !important; }
        }
        @media (max-width: 768px) {
          .e-nav { padding: 0 20px !important; }
          .e-nav-links { display: none !important; }
          .e-hero-widget { display: none !important; }

          /* Hero mobile — base (telas pequenas / com chrome do browser) */
          .e-hero-grid { padding: 20px 20px !important; }
          .e-hero-kicker { margin-bottom: 12px !important; }
          .e-hero-h1 { font-size: 34px !important; letter-spacing: -1.8px !important; margin-bottom: 8px !important; }
          .e-hero-subtitle { font-size: 24px !important; margin-bottom: 12px !important; }
          .e-hero-body { font-size: 15px !important; line-height: 1.5 !important; margin-bottom: 14px !important; }
          .e-hero-cta-row { margin-bottom: 16px !important; }
          .e-hero-stats { padding-top: 10px !important; align-items: flex-start !important; gap: 16px !important; }
          .e-hero-stat-num { font-size: 22px !important; }
          .e-candidaturas-visual { order: 2 !important; }
          .e-candidaturas-text { order: 1 !important; }
          .e-prep-visual { display: none !important; }
          .e-logos-bar {
            flex-direction: column !important;
            align-items: flex-start !important;
            padding: 14px 0 !important;
            margin-left: -20px !important;
            margin-right: -20px !important;
          }
          .e-logos-label {
            display: block !important;
            padding: 0 20px 10px !important;
          }
          .e-logos-label-desktop { display: none !important; }
          .e-logos-label-mobile { display: inline !important; }
          .e-logos-bar > div { width: 100% !important; }
          .e-cta-final-btns { flex-direction: column !important; align-items: stretch !important; }
          section { padding-left: 20px !important; padding-right: 20px !important; }
          .e-notpare-row { grid-template-columns: 32px 40px 1fr !important; }
          .e-notpare-row > a:last-child { display: none !important; }
          .e-creator-subtitle { flex-direction: column !important; align-items: flex-start !important; gap: 4px !important; }
          .e-creator-quote { padding-left: 0 !important; }
        }
        @media (max-width: 580px) {
          .e-pricing-grid { grid-template-columns: 1fr !important; }
          .e-footer-strip { flex-direction: column !important; }
        }

        /* Hero mobile — telas médias (700–800px, ex: iPhone SE sem chrome, Pixel 6a) */
        @media (max-width: 768px) and (min-height: 700px) {
          .e-hero-grid { padding: 36px 20px !important; }
          .e-hero-kicker { margin-bottom: 30px !important; }
          .e-hero-h1 { margin-bottom: 16px !important; }
          .e-hero-subtitle { margin-bottom: 26px !important; }
          .e-hero-body { margin-bottom: 30px !important; }
          .e-hero-cta-row { margin-bottom: 40px !important; }
          .e-hero-stats { padding-top: 24px !important; }
        }

        /* Hero mobile — telas grandes (800px+, ex: Galaxy S24, iPhone 12/13/14) */
        @media (max-width: 768px) and (min-height: 800px) {
          .e-hero-grid { padding: 48px 20px !important; }
          .e-hero-kicker { margin-bottom: 40px !important; }
          .e-hero-h1 { margin-bottom: 20px !important; }
          .e-hero-subtitle { margin-bottom: 32px !important; }
          .e-hero-body { margin-bottom: 44px !important; }
          .e-hero-cta-row { margin-bottom: 56px !important; }
          .e-hero-stats { padding-top: 32px !important; }
        }
      `}</style>

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static structured data
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "EarlyCV",
              url: siteConfig.siteUrl,
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "EarlyCV",
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
