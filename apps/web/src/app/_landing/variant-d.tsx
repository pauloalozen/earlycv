import Image from "next/image";
import Link from "next/link";
import React from "react";
import { Logo } from "@/components/logo";
import { PublicFooter } from "@/components/public-footer";
import { siteConfig } from "@/lib/site";
import { AtsWidget } from "../_ats-widget";
import { LandingNavAuth } from "../_landing-nav-auth";
import { LandingScrollAnimations } from "../_landing-scroll-animations";
import { buildPlanCatalog } from "../planos/plan-catalog";
import { SocialProofSection } from "./_social-proof";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export function LandingVariantD() {
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

          {/* Right — ATS Widget */}
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
      </section>

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
        </div>
      </section>

      {/* ── Prova Social ── */}
      <SocialProofSection />

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

                {plan.unitPriceCents != null && (
                  <div
                    style={{
                      marginBottom: 14,
                      paddingTop: 10,
                      paddingBottom: 10,
                      borderTop: plan.featured
                        ? "1px solid rgba(198,255,58,0.15)"
                        : "1px solid rgba(10,10,10,0.07)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11.5,
                        fontWeight: 600,
                        color: plan.featured ? "#c6ff3a" : "#71717a",
                        letterSpacing: 0.1,
                      }}
                    >
                      Download de CV sai a R${" "}
                      {(plan.unitPriceCents / 100).toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                )}

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
                        borderRadius: 8,
                        padding: "10px 16px",
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: "none",
                        letterSpacing: -0.1,
                        border: "none",
                        cursor: "pointer",
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
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Guarantee ── */}
      <section
        style={{
          background: "#fff",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          padding: "80px 32px",
        }}
      >
        <div
          style={{
            maxWidth: 640,
            margin: "0 auto",
            textAlign: "center",
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.8,
              color: "#8a8a85",
              marginBottom: 18,
              textTransform: "uppercase",
            }}
          >
            Garantia de satisfação
          </p>

          <h3
            style={{
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 500,
              letterSpacing: -1.2,
              lineHeight: 1.1,
              color: "#0a0a0a",
              margin: "0 0 16px",
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
          </h3>
          <p
            style={{
              fontSize: 16,
              color: "#5a5a55",
              lineHeight: 1.65,
              maxWidth: 440,
              margin: "0 auto 36px",
            }}
          >
            Sem formulário, sem burocracia. Se a adaptação não entregou valor,
            manda uma mensagem e o dinheiro volta.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 20,
              flexWrap: "wrap",
              marginBottom: 36,
            }}
          >
            {[
              "Reembolso integral garantido",
              "Sem perguntas ou burocracia",
            ].map((text) => (
              <span
                key={text}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13.5,
                  color: "#0a0a0a",
                  fontWeight: 400,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
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

          <Link
            href="/adaptar"
            className="lp-cta-primary"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "14px 28px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            Testar grátis agora
            <span className="lp-cta-arrow">→</span>
          </Link>
        </div>
      </section>

      {/* ── Founder ── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "80px 32px" }}>
        <div
          style={{
            background: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 16,
            padding: "28px 32px",
            display: "flex",
            gap: 20,
            alignItems: "flex-start",
            maxWidth: 620,
            margin: "0 auto",
            backdropFilter: "blur(6px)",
          }}
        >
          <Image
            src="/paulo-alozen.jpg"
            alt="Paulo Alozen"
            width={52}
            height={52}
            style={{
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#0a0a0a",
                marginBottom: 2,
              }}
            >
              Paulo Alozen
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 12,
                color: "#8a8a85",
                marginBottom: 10,
              }}
            >
              Criador do EarlyCV
              <Link
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
                }}
              >
                ↗ LinkedIn
              </Link>
            </div>
            <p
              style={{
                fontSize: 13,
                color: "#5a5a55",
                lineHeight: 1.65,
                fontStyle: "italic",
                margin: 0,
              }}
            >
              "Criei o EarlyCV depois de mandar o mesmo currículo para vagas
              diferentes e não passar em nenhuma triagem. Hoje uso essa mesma
              ferramenta para adaptar meu CV a cada vaga que realmente me
              interessa."
            </p>
          </div>
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div
        style={{
          textAlign: "center",
          padding: "60px 32px 100px",
          maxWidth: 700,
          margin: "0 auto",
        }}
      >
        <h2
          style={{
            fontSize: "clamp(32px, 5vw, 54px)",
            fontWeight: 500,
            letterSpacing: -2,
            lineHeight: 1.05,
            margin: "0 auto 20px",
            color: "#0a0a0a",
          }}
        >
          A próxima vaga
          <br />
          <em
            style={{
              fontFamily: SERIF_ITALIC,
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            pode ser a sua.
          </em>
        </h2>
        <p
          style={{
            fontSize: 17,
            color: "#5a5a55",
            margin: "0 auto 32px",
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          Adaptar seu CV para ela leva 60 segundos. Análise é grátis.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/adaptar"
            className="lp-cta-primary"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "14px 24px",
              fontSize: 15,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              boxShadow:
                "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
            }}
          >
            Adaptar meu CV agora
            <span className="lp-cta-arrow">→</span>
          </Link>
          <span style={{ fontSize: 13, color: "#8a8a85" }}>
            Sem cadastro · Resultado imediato
          </span>
        </div>
      </div>

      <PublicFooter />

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

        /* Scroll reveal */
        .reveal-card {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.52s cubic-bezier(.25,.46,.45,.94), transform 0.52s cubic-bezier(.25,.46,.45,.94);
        }
        .reveal-card.reveal-visible {
          opacity: 1;
          transform: translateY(0);
        }
        .how-card-featured { transform: translateY(18px); }
        .how-card-featured.reveal-visible { transform: translateY(-6px); }
        @media (max-width: 768px) {
          .reveal-card { transform: translateX(24px); }
          .reveal-card.reveal-visible { transform: translateX(0); }
          .how-card-featured { transform: translateX(24px); }
          .how-card-featured.reveal-visible { transform: translateX(0); }
        }

        /* ── Social Proof ── */
        :root {
          --ink: #0a0a0a;
          --ink-soft: #2a2620;
          --sub: #45443e;
          --mono-mute: #8a8a85;
          --paper: #fafaf6;
          --line: rgba(10,10,10,0.08);
          --line-soft: rgba(10,10,10,0.06);
          --accent: #c6ff3a;
        }

        .social-proof { padding: 96px 80px 104px; max-width: 1360px; margin: 0 auto; }

        .sp-head { text-align: center; max-width: 800px; margin: 0 auto 52px; display: flex; flex-direction: column; align-items: center; }
        .sp-seal {
          display: inline-flex; align-items: center; gap: 8px;
          font-family: var(--font-geist-mono), ui-monospace, monospace;
          font-size: 10.5px; letter-spacing: 1.2px; font-weight: 500; color: #555;
          background: rgba(10,10,10,0.04); border: 1px solid var(--line-soft);
          padding: 6px 11px; border-radius: 999px; margin-bottom: 24px; text-transform: uppercase;
        }
        .sp-seal .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 6px var(--accent); display: inline-block; }
        .sp-title { font-size: 47px; font-weight: 500; letter-spacing: -1.9px; line-height: 1.05; margin: 0 0 18px; color: var(--ink); text-wrap: balance; }
        .sp-title em { font-family: var(--font-instrument-serif), serif; font-style: italic; font-weight: 400; letter-spacing: -0.6px; }
        .sp-sub { font-size: 16.5px; line-height: 1.55; color: var(--sub); margin: 0; max-width: 560px; }

        .sp-stage { display: grid; grid-template-columns: 1.32fr 1fr; gap: 16px; align-items: stretch; }

        .sp-feature {
          background: #0a0a0a; border-radius: 18px; padding: 40px 40px 30px;
          box-shadow: 0 30px 64px -26px rgba(10,10,10,0.46);
          position: relative; overflow: hidden;
          display: flex; flex-direction: column; min-height: 360px;
        }
        .sp-feature::after {
          content: ""; position: absolute; right: -90px; top: -90px;
          width: 300px; height: 300px; border-radius: 50%;
          background: radial-gradient(circle, rgba(198,255,58,0.16) 0%, rgba(198,255,58,0) 70%);
          pointer-events: none; transition: transform .8s ease;
        }
        .sp-feature-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; position: relative; z-index: 1; }
        .sp-stars { display: inline-flex; gap: 4px; }
        .sp-stars svg { width: 15px; height: 15px; display: block; fill: var(--accent); }
        .sp-stars.reveal { animation: starReveal .55s .05s both; }
        @keyframes starReveal { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
        .sp-index { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 1px; color: #6f6f68; font-variant-numeric: tabular-nums; }
        .sp-index b { color: var(--accent); font-weight: 500; }

        .sp-feature-inner { position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; transition: opacity .34s ease, transform .34s cubic-bezier(.3,.9,.4,1); }
        .sp-feature-inner.is-leaving { opacity: 0; transform: translateY(-12px); }
        .sp-quote { font-size: 26px; line-height: 1.4; letter-spacing: -0.7px; color: #fafaf6; font-weight: 400; margin: 0 0 30px; max-width: 580px; }
        .sp-quote em { font-family: var(--font-instrument-serif), serif; font-style: italic; font-weight: 400; color: var(--accent); letter-spacing: -0.2px; }

        .sp-id { display: flex; align-items: center; gap: 13px; margin-top: auto; }
        .sp-avatar {
          width: 44px; height: 44px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 14px; font-weight: 600; letter-spacing: -0.3px;
          background: rgba(198,255,58,0.14); color: var(--accent); border: 1px solid rgba(198,255,58,0.35);
        }
        .sp-name { font-size: 14.5px; font-weight: 500; letter-spacing: -0.2px; color: #fafaf6; line-height: 1.3; }
        .sp-meta { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 10px; letter-spacing: 0.6px; color: #7d7d76; text-transform: uppercase; margin-top: 2px; }

        .sp-progress { position: relative; z-index: 1; height: 3px; border-radius: 99px; background: rgba(250,250,246,0.12); overflow: hidden; margin-top: 26px; }
        .sp-progress-bar { height: 100%; width: 0; background: var(--accent); border-radius: 99px; }

        .sp-roster { display: grid; grid-template-columns: 1fr 1fr; grid-auto-rows: 1fr; gap: 10px; }
        .sp-chip {
          background: var(--paper); border: 1px solid var(--line); border-radius: 13px;
          padding: 15px 16px; cursor: pointer; text-align: left;
          display: flex; flex-direction: column; gap: 11px;
          font-family: inherit; color: var(--ink-soft);
          transition: background .35s ease, color .35s ease, border-color .35s ease, box-shadow .35s ease, transform .25s cubic-bezier(.3,.9,.4,1);
        }
        .sp-chip:hover { transform: translateY(-2px); box-shadow: 0 12px 26px -14px rgba(10,10,10,0.22); }
        .sp-chip-top { display: flex; align-items: center; justify-content: space-between; }
        .sp-chip-stars { display: inline-flex; gap: 2.5px; }
        .sp-chip-stars svg { width: 10px; height: 10px; display: block; fill: #1f1c17; opacity: 0.32; transition: fill .35s ease, opacity .35s ease; }
        .sp-chip-av {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; letter-spacing: -0.3px;
          background: rgba(10,10,10,0.05); color: var(--ink-soft); border: 1px solid var(--line);
          transition: background .35s ease, color .35s ease, border-color .35s ease;
        }
        .sp-chip-role { font-size: 12.5px; font-weight: 500; line-height: 1.35; letter-spacing: -0.1px; }

        .sp-chip.is-active {
          background: #0a0a0a; border-color: #0a0a0a; color: #fafaf6;
          box-shadow: 0 16px 34px -16px rgba(10,10,10,0.4);
        }
        .sp-chip.is-active .sp-chip-av { background: rgba(198,255,58,0.16); color: var(--accent); border-color: rgba(198,255,58,0.35); }
        .sp-chip.is-active .sp-chip-stars svg { fill: var(--accent); opacity: 1; }

        .sp-cta { display: flex; flex-direction: column; align-items: center; gap: 14px; margin-top: 60px; }
        .sp-cta-hint { font-family: var(--font-geist-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.4px; color: var(--mono-mute); text-transform: uppercase; }
        .sp-btn {
          background: var(--ink); color: #fff; border: none; border-radius: 10px;
          padding: 15px 24px; font-size: 14.5px; font-weight: 500;
          letter-spacing: -0.1px; cursor: pointer; display: inline-flex; align-items: center; gap: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08);
          text-decoration: none;
        }

        @media (max-width: 1040px) {
          .social-proof { padding: 80px 48px 88px; }
          .sp-stage { grid-template-columns: 1fr; }
          .sp-roster { grid-template-columns: repeat(3, 1fr); }
          .sp-quote { font-size: 24px; }
          .sp-title { font-size: 40px; letter-spacing: -1.4px; }
        }

        @media (max-width: 680px) {
          .social-proof { padding: 60px 20px 72px; }
          .sp-head { margin-bottom: 36px; }
          .sp-title { font-size: 31px; letter-spacing: -1px; }
          .sp-sub { font-size: 15.5px; }
          .sp-feature { padding: 30px 26px 24px; min-height: 320px; }
          .sp-quote { font-size: 21px; line-height: 1.42; }
          .sp-roster { grid-template-columns: 1fr 1fr; }
          .sp-cta { margin-top: 44px; }
          .sp-btn { width: 100%; justify-content: center; }
        }

        @media (prefers-reduced-motion: reduce) {
          .sp-feature-inner, .sp-chip, .sp-stage > *, .sp-stars.reveal { transition: none !important; animation: none !important; }
          .sp-stage > *, .sp-chip { opacity: 1 !important; transform: none !important; }
        }

        /* Responsive layout */
        @media (max-width: 900px) {
          .landing-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
          .how-steps-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          .lp-nav { padding: 14px 20px !important; background: #f3f2ed !important; }
          .lp-nav-links { display: none !important; }
          .lp-hero-h1 { letter-spacing: -1.8px !important; }
          .lp-ats-wrap { display: none !important; }
          section { padding-left: 20px !important; padding-right: 20px !important; }
          footer { padding-left: 20px !important; padding-right: 20px !important; flex-direction: column !important; gap: 12px !important; align-items: flex-start !important; }
        }
        @media (max-width: 580px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

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
