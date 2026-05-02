import type { Metadata } from "next";
import Link from "next/link";
import React from "react";
import { Logo } from "@/components/logo";
import { getAbsoluteUrl, siteConfig } from "@/lib/site";
import { AtsWidget } from "./_ats-widget";
import { LandingNavAuth } from "./_landing-nav-auth";
import { LandingScrollAnimations } from "./_landing-scroll-animations";
import { buildPlanCatalog } from "./planos/plan-catalog";

export const metadata: Metadata = {
  title: "Seu CV ajustado para cada vaga",
  description:
    "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  alternates: {
    canonical: getAbsoluteUrl("/"),
  },
  keywords: [
    ...siteConfig.keywords,
    "adaptar curriculo para vaga",
    "cv ajustado",
    "curriculo ats",
    "análise de currículo",
  ],
  openGraph: {
    url: getAbsoluteUrl("/"),
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EarlyCV - Seu CV ajustado para cada vaga",
    description:
      "Descubra o que está te eliminando nas vagas e receba um CV ajustado para aumentar suas chances de entrevista.",
  },
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export default function Home() {
  const plans = buildPlanCatalog(process.env);

  return (
    <main
      style={{
        fontFamily: GEIST,
        color: "#0a0a0a",
        background:
          "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        position: "relative",
        overflowX: "hidden",
        paddingTop: 61,
      }}
    >
      {/* Grain overlay */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      {/* ── Nav ── */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 32px",
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          background: "rgba(243,242,237,0.95)",
        }}
        className="lp-nav"
      >
        {/* Logo */}
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
            v1.2
          </span>
        </Link>

        {/* Nav right + mobile — client component (keeps landing page static/cacheable) */}
        <LandingNavAuth />
      </nav>

      <LandingScrollAnimations />

      {/* ── Hero ── */}
      <section
        id="hero"
        style={{
          minHeight: "calc(100dvh - 61px)",
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          padding: "40px 32px",
          scrollMarginTop: "61px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 1100,
            margin: "0 auto",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 48,
            alignItems: "center",
          }}
          className="landing-hero"
        >
          {/* Left — copy */}
          <div>
            {/* Kicker */}
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
                marginBottom: 28,
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
              ANÁLISE GRÁTIS • SEM CARTÃO • RESULTADO IMEDIATO
            </div>

            {/* H1 */}
            <h1
              style={{
                fontSize: "clamp(36px, 8vw, 72px)",
                fontWeight: 500,
                letterSpacing: -2.6,
                lineHeight: 0.98,
                margin: "0 0 24px",
                color: "#0a0a0a",
              }}
              className="lp-hero-h1"
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
              <br />
            </h1>

            {/* Sub */}
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.55,
                color: "#45443e",
                margin: "0 0 32px",
                maxWidth: 480,
                fontWeight: 400,
              }}
            >
              Você está sendo filtrado antes de alguém ler. Ajustamos seu CV
              para a vaga em segundos.
            </p>

            {/* CTA row */}
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                marginBottom: 48,
              }}
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
                    "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                  transition: "transform 180ms, box-shadow 180ms",
                }}
                className="lp-cta-primary"
              >
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
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
                </span>
                <span className="lp-cta-text-desktop">
                  Analisar meu CV grátis
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
                Ver uma análise
              </Link>
            </div>

            {/* Meta row */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                paddingTop: 28,
                borderTop: "1px solid rgba(10,10,10,0.08)",
              }}
            >
              {[
                { num: "2min", label: "análise\ncompleta do CV" },
                { num: "32%", label: "ganho médio de\naderência a vaga" },
                { num: "12+", label: "melhorias\nsugeridas por CV" },
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
                    style={{ display: "flex", flexDirection: "column", gap: 2 }}
                  >
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 500,
                        letterSpacing: -1,
                        color: "#0a0a0a",
                      }}
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

          {/* Right — ATS Widget (hidden on mobile) */}
          <div
            className="lp-ats-wrap"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <AtsWidget />
          </div>
        </div>
        {/* end inner max-width */}
      </section>
      {/* end hero outer */}

      {/* ── Social proof strip ── */}
      {/* <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          padding: "0 32px 40px",
          maxWidth: 1100,
          margin: "0 auto",
          width: "100%",
          position: "relative",
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
            whiteSpace: "nowrap",
          }}
        >
          CANDIDATOS CONTRATADOS EM
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {["Itaú", "Nubank", "Stone", "iFood", "Mercado Livre", "Globo"].map(
            (name, i, arr) => (
              <>
                <span
                  key={name}
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#2a2a28",
                    letterSpacing: -0.2,
                    opacity: 0.72,
                  }}
                >
                  {name}
                </span>
                {i < arr.length - 1 && (
                  <span
                    key={`dot-${name}`}
                    style={{ color: "#c0beb4", fontSize: 12 }}
                  >
                    ·
                  </span>
                )}
              </>
            ),
          )}
        </div>
      </div> */}

      {/* ── Como funciona ── */}
      <section
        id="como-funciona"
        style={{
          minHeight: "100dvh",
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          padding: "80px 32px",
          background: "rgba(255,255,255,0.45)",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: "61px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.4,
                fontWeight: 500,
                color: "#555",
                background: "rgba(10,10,10,0.04)",
                border: "1px solid rgba(10,10,10,0.06)",
                padding: "6px 10px",
                borderRadius: 999,
                marginBottom: 22,
                textTransform: "uppercase" as const,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  boxShadow: "0 0 6px #c6ff3a",
                  flexShrink: 0,
                }}
              />
              Como funciona
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 5.5vw, 48px)",
                fontWeight: 500,
                letterSpacing: -1.8,
                lineHeight: 1.05,
                margin: "12px 0 0",
                color: "#0a0a0a",
              }}
            >
              Três passos para{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                  letterSpacing: -0.5,
                }}
              >
                mais entrevistas
              </em>
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
            className="how-steps-grid"
          >
            {[
              {
                step: "01",
                title: "Envie seu CV e a vaga",
                body: "Cole o PDF do seu currículo e a descrição da vaga. Funciona com qualquer formato de CV — PDF, DOC ou DOCX.",
                detail: "Upload · Cole a vaga",
                highlight: false,
              },
              {
                step: "02",
                title: "Analisamos e mostramos o que ajustar",
                body: "Nossa IA compara seu CV com os requisitos da vaga e identifica lacunas, keywords e pontuação ATS.",
                detail: "Score ATS · Keywords · Gaps",
                highlight: true,
              },
              {
                step: "03",
                title: "Baixe seu CV pronto para aplicar",
                body: "Receba o CV reescrito e otimizado para a vaga em PDF e DOCX, pronto para enviar.",
                detail: "PDF · DOCX · 1 crédito",
                highlight: false,
              },
            ].map((item, i) => (
              <div
                key={item.step}
                className={`reveal-card${item.highlight ? " how-card-featured" : ""}`}
                style={{
                  background: item.highlight ? "#0a0a0a" : "#fafaf6",
                  border: item.highlight
                    ? "none"
                    : "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 16,
                  padding: "28px 28px 24px",
                  position: "relative",
                  boxShadow: item.highlight
                    ? "0 28px 60px -20px rgba(10,10,10,0.4)"
                    : "0 1px 2px rgba(0,0,0,0.03)",
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 300,
                  transitionDelay: `${i * 0.12}s`,
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    letterSpacing: 1.4,
                    fontWeight: 500,
                    color: item.highlight ? "#a0a098" : "#8a8a85",
                    marginBottom: 24,
                  }}
                >
                  {item.step}
                </div>
                <div
                  style={{
                    width: 32,
                    height: 1,
                    background: item.highlight
                      ? "rgba(198,255,58,0.6)"
                      : "rgba(10,10,10,0.12)",
                    marginBottom: 24,
                  }}
                />
                <h3
                  style={{
                    fontSize: 20,
                    fontWeight: 500,
                    letterSpacing: -0.7,
                    color: item.highlight ? "#fafaf6" : "#0a0a0a",
                    margin: "0 0 14px",
                    lineHeight: 1.2,
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontSize: 14,
                    lineHeight: 1.6,
                    color: item.highlight ? "#a0a098" : "#5a5a55",
                    margin: "0 0 24px",
                    fontWeight: 400,
                    flex: 1,
                  }}
                >
                  {item.body}
                </p>
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1,
                    color: item.highlight ? "#7a7a74" : "#a0a098",
                    borderTop: item.highlight
                      ? "1px solid rgba(250,250,246,0.08)"
                      : "1px solid rgba(10,10,10,0.06)",
                    paddingTop: 14,
                    marginTop: "auto",
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
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
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
              </span>
              <span>Começar agora grátis</span>
              <span className="lp-cta-arrow">→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Preços ── */}
      <section
        id="precos"
        style={{
          minHeight: "100dvh",
          position: "relative",
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          padding: "80px 32px",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          scrollMarginTop: "61px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.4,
                fontWeight: 500,
                color: "#555",
                background: "rgba(10,10,10,0.04)",
                border: "1px solid rgba(10,10,10,0.06)",
                padding: "6px 10px",
                borderRadius: 999,
                marginBottom: 22,
                textTransform: "uppercase" as const,
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  boxShadow: "0 0 6px #c6ff3a",
                  flexShrink: 0,
                }}
              />
              Preços
            </div>
            <h2
              style={{
                fontSize: "clamp(26px, 5.5vw, 48px)",
                fontWeight: 500,
                letterSpacing: -1.8,
                lineHeight: 1.05,
                margin: "12px 0 8px",
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
                fontSize: 15,
                color: "#5a5a55",
                margin: "0 auto",
                maxWidth: 460,
              }}
            >
              Análise grátis sempre. Pague só quando quiser baixar o CV
              ajustado.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 16,
              alignItems: "stretch",
            }}
            className="pricing-grid"
          >
            {plans.map((plan, i) => (
              <div
                key={plan.id}
                className="reveal-card"
                style={{
                  background: plan.featured
                    ? "#0a0a0a"
                    : "rgba(255,255,255,0.7)",
                  border: plan.featured
                    ? "none"
                    : "1px solid rgba(10,10,10,0.07)",
                  borderRadius: 16,
                  padding: "28px 24px",
                  position: "relative",
                  backdropFilter: "blur(6px)",
                  display: "flex",
                  flexDirection: "column",
                  transitionDelay: `${i * 0.1}s`,
                }}
              >
                {plan.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: -10,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: plan.featured ? "#c6ff3a" : "#0a0a0a",
                      color: plan.featured ? "#0a0a0a" : "#fff",
                      borderRadius: 999,
                      padding: "3px 10px",
                      fontSize: 10.5,
                      fontWeight: 600,
                      fontFamily: MONO,
                      letterSpacing: 0.5,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: plan.featured
                        ? "rgba(255,255,255,0.6)"
                        : "#6a6a66",
                      marginBottom: 8,
                      letterSpacing: 0.3,
                    }}
                  >
                    {plan.label}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "baseline",
                      gap: 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 36,
                        fontWeight: 500,
                        letterSpacing: -1.5,
                        color: plan.featured ? "#fff" : "#0a0a0a",
                        lineHeight: 1,
                      }}
                    >
                      {plan.price}
                    </span>
                    <span
                      style={{
                        fontSize: 20,
                        fontWeight: 500,
                        color: plan.featured
                          ? "rgba(255,255,255,0.7)"
                          : "#6a6a66",
                      }}
                    >
                      {plan.cents}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: plan.featured
                        ? "rgba(255,255,255,0.45)"
                        : "#8a8a85",
                      marginTop: 4,
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
                    gap: 7,
                    flex: 1,
                  }}
                >
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      style={{
                        fontSize: 12.5,
                        color: plan.featured
                          ? "rgba(255,255,255,0.75)"
                          : "#45443e",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 7,
                        lineHeight: 1.4,
                      }}
                    >
                      <span
                        style={{
                          color: plan.featured ? "#c6ff3a" : "#4a9c4a",
                          fontSize: 11,
                          marginTop: 1,
                          flexShrink: 0,
                        }}
                      >
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  href={plan.cta_link}
                  style={{
                    display: "block",
                    textAlign: "center",
                    background: plan.featured ? "#c6ff3a" : "#0a0a0a",
                    color: plan.featured ? "#0a0a0a" : "#fff",
                    borderRadius: 8,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    textDecoration: "none",
                    letterSpacing: -0.1,
                  }}
                >
                  {plan.cta_lading}
                </Link>
              </div>
            ))}
          </div>

          {/* <div style={{ textAlign: "center", marginTop: 28 }}>
            <Link
              href="/planos"
              style={{
                fontSize: 13,
                color: "#6a6a66",
                textDecoration: "underline",
                textDecorationColor: "rgba(10,10,10,0.2)",
                textUnderlineOffset: 3,
              }}
            >
              Ver comparativo completo de planos →
            </Link>
          </div> */}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 32px",
          position: "relative",
          zIndex: 2,
          borderTop: "1px solid rgba(10,10,10,0.05)",
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#8a8a85",
            letterSpacing: 0.2,
          }}
        >
          © earlyCV · 2026
        </span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link
            href="/blog"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Blog
          </Link>
          <Link
            href="/curriculo-ats"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Curriculo ATS
          </Link>
          <Link
            href="/adaptar-curriculo-para-vaga"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Adaptar curriculo
          </Link>
          <Link
            href="/palavras-chave-curriculo"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Palavras-chave
          </Link>
          <Link
            href="/termos-de-uso"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Termos
          </Link>
          <Link
            href="/privacidade"
            style={{ fontSize: 12, color: "#6a6a66", textDecoration: "none" }}
          >
            Privacidade
          </Link>
          <span style={{ fontSize: 12, color: "#6a6a66" }}>
            contato@earlycv.com.br
          </span>
        </div>
      </footer>

      {/* CSS for CTA hover + responsive + smooth scroll + scroll reveal */}
      <style>{`
        html { scroll-behavior: smooth; }

        .lp-cta-text-mobile { display: none; }
        @media (max-width: 768px) {
          .lp-cta-text-desktop { display: none; }
          .lp-cta-text-mobile { display: inline; }
        }

        .lp-cta-primary { transition: transform 180ms, box-shadow 180ms !important; }
        .lp-cta-primary:hover {
          transform: translateY(-1px) !important;
          box-shadow: 0 10px 24px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08) !important;
        }
        .lp-cta-arrow { display: inline-block; transition: transform 240ms cubic-bezier(.3,.9,.4,1); }
        .lp-cta-primary:hover .lp-cta-arrow { transform: translateX(4px); }

        /* Scroll reveal — desktop: fade + slide up */
        .reveal-card {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94);
        }
        .reveal-card.reveal-visible {
          opacity: 1;
          transform: translateY(0);
        }
        /* Featured "como funciona" card — elevated 6px above peers, both hidden and revealed */
        .how-card-featured { transform: translateY(18px); }
        .how-card-featured.reveal-visible { transform: translateY(-6px); }
        /* Mobile: slide from side instead */
        @media (max-width: 768px) {
          .reveal-card { transform: translateX(24px); }
          .reveal-card.reveal-visible { transform: translateX(0); }
          .how-card-featured { transform: translateX(24px); }
          .how-card-featured.reveal-visible { transform: translateX(0); }
        }

        @media (max-width: 900px) {
          .landing-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
          .how-steps-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          /* Nav */
          .lp-nav { padding: 14px 20px !important; background: #f3f2ed !important; }
          .lp-nav-links { display: none !important; }

          /* Hero */
          .lp-hero-h1 { letter-spacing: -1.8px !important; }
          .lp-ats-wrap { display: none !important; }

          /* Sections padding */
          section { padding-left: 20px !important; padding-right: 20px !important; }
          footer { padding-left: 20px !important; padding-right: 20px !important; flex-direction: column !important; gap: 12px !important; align-items: flex-start !important; }
        }
        @media (max-width: 580px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static structured data, no user input
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
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "EarlyCV",
              url: siteConfig.siteUrl,
              contactPoint: {
                "@type": "ContactPoint",
                email: "contato@earlycv.app",
                contactType: "customer support",
                availableLanguage: "Portuguese",
              },
            },
          ]),
        }}
      />
    </main>
  );
}
