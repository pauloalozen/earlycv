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
import { BeforeAfterCarousel } from "./variant-b-carousel";
import { HeroEyebrow } from "./variant-b-eyebrow";
import { AnimatedFaq } from "./variant-b-faq";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

export function LandingVariantB() {
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
      <LandingScrollAnimations />

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
          backdropFilter: "blur(12px)",
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
            v1.2
          </span>
        </Link>
        <LandingNavAuth />
      </nav>

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
            {/* Eyebrow — client component with dynamic counter */}
            <HeroEyebrow />

            {/* H1 */}
            <h1
              style={{
                fontSize: "clamp(36px, 7.5vw, 68px)",
                fontWeight: 500,
                letterSpacing: -2.3,
                lineHeight: 0.98,
                margin: "0 0 24px",
                color: "#0a0a0a",
              }}
              className="lp-hero-h1"
            >
              Você manda currículo.
              <br />
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                  letterSpacing: -1,
                }}
              >
                Não ouve mais nada.
              </em>
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
              A vaga foi para quem se encaixou no descritivo — não para quem era
              mais qualificado. Ajustamos seu CV para a vaga em segundos.
            </p>

            {/* CTA row */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                alignItems: "center",
                marginBottom: 48,
              }}
            >
              <Link
                href="/adaptar"
                className="lp-cta-primary lp-hero-cta"
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
                }}
              >
                Adaptar meu CV agora
                <span className="lp-cta-arrow">→</span>
              </Link>
              <Link
                href="/demo-resultado"
                className="lp-demo-link"
                style={{
                  color: "#0a0a0a",
                  fontSize: 14,
                  fontWeight: 500,
                  padding: "14px 0",
                  textDecoration: "underline",
                  textDecorationColor: "rgba(10,10,10,0.2)",
                  textUnderlineOffset: 4,
                }}
              >
                Ver uma análise
              </Link>
            </div>

            {/* Meta row — same as variant-A */}
            <div
              className="lp-meta-row"
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

          {/* Right — AtsWidget */}
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

      {/* ── Before / After (carousel) ── */}
      <section
        style={{
          background: "#f0efe9",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          borderBottom: "1px solid rgba(10,10,10,0.06)",
          padding: "80px 32px",
        }}
      >
        <div style={{ maxWidth: 1100, margin: "0 auto", width: "100%" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.8,
              color: "#8a8a85",
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            O que muda
          </p>
          <h2
            style={{
              fontSize: "clamp(28px, 4vw, 42px)",
              fontWeight: 500,
              letterSpacing: -1.2,
              margin: "0 0 12px",
              lineHeight: 1.15,
            }}
          >
            O mesmo profissional.
            <br />
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              Um CV que fala a língua da vaga.
            </em>
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "#5a5a55",
              marginBottom: 40,
              maxWidth: 520,
            }}
          >
            O EarlyCV não inventa nada. Ele reorganiza, destaca e adapta o que
            você já tem — para que o recrutador (e o ATS) encontre o que
            procura.
          </p>

          <BeforeAfterCarousel />
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
                textTransform: "uppercase",
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

          {/* Cards — exact visual style of variant-A */}
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
                title: "Sobe seu CV em PDF",
                body: "Manda o currículo que você já usa. Não precisa ajustar nada antes — o EarlyCV trabalha com o que você tem.",
                detail: "Upload · PDF · DOC · DOCX",
                highlight: false,
              },
              {
                step: "02",
                title: "Cola a descrição da vaga",
                body: "Copia e cola o texto da vaga — do LinkedIn, Gupy, Lever, onde for. Não precisa formatar nada.",
                detail: "LinkedIn · Gupy · Lever · Qualquer texto",
                highlight: true,
              },
              {
                step: "03",
                title: "Recebe o CV adaptado",
                body: "O EarlyCV devolve seu CV reorganizado para aquela vaga — experiências certas na frente, keywords da JD no lugar certo.",
                detail: "CV adaptado · PDF · DOCX · 1 crédito",
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
              className="lp-cta-primary"
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
            >
              Começar agora grátis
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
                textTransform: "uppercase",
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
                    style={{ display: "flex", alignItems: "baseline", gap: 1 }}
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

          {/* Mercado Pago trust strip */}
          <div
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(10,10,10,0.07)",
              borderRadius: 12,
              padding: "14px 24px",
              marginTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 28,
              flexWrap: "wrap",
              backdropFilter: "blur(6px)",
            }}
          >
            {[
              { icon: "🔒", text: "Pagamento 100% seguro" },
              { icon: "💳", text: "Pix, cartão ou parcelado" },
              { icon: "🛡️", text: "Processado pelo Mercado Pago" },
            ].map(({ icon, text }) => (
              <span
                key={text}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 13,
                  color: "#45443e",
                }}
              >
                <span style={{ fontSize: 15 }}>{icon}</span>
                {text}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section
        style={{
          background: "rgba(255,255,255,0.45)",
          borderTop: "1px solid rgba(10,10,10,0.06)",
          padding: "80px 32px",
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.8,
              color: "#8a8a85",
              marginBottom: 12,
              textTransform: "uppercase",
            }}
          >
            Perguntas frequentes
          </p>
          <h2
            style={{
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 500,
              letterSpacing: -1.2,
              marginBottom: 40,
              color: "#0a0a0a",
            }}
          >
            Dúvidas antes de começar
          </h2>
          <AnimatedFaq />
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
          {/* Section tag */}
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

          {/* Trust items — badge com bolinha verde */}
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
              "Resposta em até 24 horas",
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

      {/* JSON-LD structured data — paridade SEO com variant-A */}
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
              founder: {
                "@type": "Person",
                name: "Paulo Alozen",
                url: "https://www.linkedin.com/in/pauloalozen/",
              },
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

      <style>{`
        html { scroll-behavior: smooth; }

        /* Eyebrow dot pulse */
        .b-dot-pulse {
          width: 6px; height: 6px; border-radius: 50%;
          background: #c6ff3a; box-shadow: 0 0 6px #c6ff3a;
          display: inline-block;
          animation: bPulse 2s ease-in-out infinite;
        }
        @keyframes bPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.8); }
        }

        /* CTA hover */
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
          .landing-hero { grid-template-columns: 1fr !important; gap: 32px !important; }
          .how-steps-grid { grid-template-columns: 1fr !important; }
          .pricing-grid { grid-template-columns: 1fr 1fr !important; }
        }
        @media (max-width: 768px) {
          .lp-nav { padding: 14px 20px !important; background: #f3f2ed !important; }
          .lp-nav-links { display: none !important; }
          .lp-hero-h1 { letter-spacing: -1.8px !important; }
          .lp-ats-wrap { display: none !important; }
          .lp-hero-cta { width: 100%; justify-content: center !important; }
          .lp-demo-link { margin-left: 10px !important; margin-top: -4px !important; padding: 6px 0 !important; }
          .lp-meta-row { align-items: flex-start !important; gap: 14px !important; }
          section, footer { padding-left: 20px !important; padding-right: 20px !important; }
        }
        @media (max-width: 580px) {
          .pricing-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
