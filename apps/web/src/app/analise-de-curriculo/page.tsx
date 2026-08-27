import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { getAbsoluteUrl } from "@/lib/site";
import { AnaliseMock, OtimizacaoMock } from "../_landing/_feature-showcase";
import {
  GEIST_V2 as GEIST,
  LandingNavV2,
  MONO_V2 as MONO,
  SERIF_ITALIC_V2 as SERIF_ITALIC,
} from "../_landing/_nav-v2";
import {
  BrowserChrome,
  browserFrame,
  btnGhost,
  btnPrimary,
  container,
  JourneyStrip,
  LandingSharedStyles,
  SectionLabel,
} from "../_landing/_shared";
import { LandingScrollAnimations } from "../_landing-scroll-animations";

const url = getAbsoluteUrl("/analise-de-curriculo");

export const metadata: Metadata = {
  title: "Análise de Currículo com Score ATS Grátis | EarlyCV",
  description:
    "Descubra por que seu currículo está sendo eliminado antes de alguém ler. Receba um score ATS de 0 a 100, com keywords, lacunas e sugestões de ajuste — grátis.",
  alternates: { canonical: url },
  openGraph: {
    title: "Análise de Currículo com Score ATS Grátis | EarlyCV",
    description:
      "Score ATS de 0 a 100, keywords ausentes e sugestões de ajuste — vaga por vaga.",
    url,
    type: "website",
  },
  twitter: {
    title: "Análise de Currículo com Score ATS Grátis | EarlyCV",
    description:
      "Score ATS de 0 a 100, keywords ausentes e sugestões de ajuste — vaga por vaga.",
  },
};

export default function AnaliseDeCurriculoPage() {
  return (
    <main
      style={{ fontFamily: GEIST, color: "#0a0a0a", background: "#ffffff" }}
    >
      <LandingScrollAnimations />
      <LandingNavV2 />

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
              fontSize: "clamp(34px, 6.4vw, 58px)",
              fontWeight: 500,
              letterSpacing: -2.2,
              lineHeight: 1.04,
              margin: "0 0 22px",
            }}
          >
            Descubra por que seu CV está sendo{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              eliminado
            </em>
            .
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
            Antes de um humano ler seu currículo, um ATS já decidiu se ele
            passa. Cole a vaga, envie seu CV e receba um score de 0 a 100 — com
            keywords ausentes, lacunas e o que ajustar em cada seção.
          </p>

          <Link href="/adaptar" style={{ ...btnPrimary, marginBottom: 56 }}>
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
              <title>Analisar</title>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Analisar meu CV grátis <span>→</span>
          </Link>

          <div
            className="reveal-card"
            style={{ ...browserFrame, maxWidth: 1080, width: "100%" }}
          >
            <BrowserChrome />
            <AnaliseMock />
          </div>

          <div
            className="reveal-card"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
              marginTop: 44,
              paddingTop: 26,
              borderTop: "1px solid rgba(10,10,10,0.1)",
            }}
          >
            {[
              { num: "2min", label: "análise\ncompleta do CV" },
              { num: "32%", label: "ganho médio de\naderência à vaga" },
              { num: "12+", label: "melhorias\nsugeridas por CV" },
            ].map((s, i) => (
              <div
                key={s.num}
                style={{ display: "flex", alignItems: "center", gap: 20 }}
              >
                {i > 0 && (
                  <div
                    style={{
                      width: 1,
                      height: 34,
                      background: "rgba(10,10,10,0.1)",
                    }}
                  />
                )}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 2 }}
                >
                  <span
                    style={{ fontSize: 26, fontWeight: 500, letterSpacing: -1 }}
                  >
                    {s.num}
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
                    {s.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIAGNÓSTICO DETALHADO */}
      <section style={{ padding: "100px 32px" }}>
        <div
          className="lp-grid-2"
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
              <SectionLabel>BREAKDOWN POR SEÇÃO</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Não é só um número —{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                é o mapa do que ajustar
              </em>
              .
            </h2>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: "0 0 24px",
                maxWidth: 420,
              }}
            >
              O score se divide por experiência, keywords e formatação. Cada
              ponto perdido vem com o motivo — e quantos pontos você ganha ao
              corrigir.
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
              src="/landing/f-tile-diagnostico.jpg"
              alt="Breakdown do score ATS earlyCV"
              width={700}
              height={610}
              style={{
                display: "block",
                width: "100%",
                height: "auto",
                background: "#0a0a0a",
              }}
            />
          </div>
        </div>
      </section>

      {/* OTIMIZAÇÃO DE CV */}
      <section style={{ padding: "0 32px 100px" }}>
        <div
          className="lp-grid-2"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            alignItems: "center",
          }}
        >
          <div className="reveal-card lp-order-1" style={browserFrame}>
            <BrowserChrome />
            <OtimizacaoMock />
          </div>
          <div className="reveal-card lp-order-2">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>DEPOIS DO DIAGNÓSTICO</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              O mesmo fluxo{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                já entrega
              </em>{" "}
              o CV ajustado.
            </h2>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: 0,
                maxWidth: 420,
              }}
            >
              Não é só diagnóstico. O mesmo upload de CV e vaga já gera a versão
              adaptada, pronta pra baixar em PDF e DOCX — reorganizada e
              reformulada, nunca inventada.
            </p>
          </div>
        </div>
      </section>

      {/* JORNADA: DA VAGA À ENTREVISTA */}
      <section style={{ padding: "100px 32px 0" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 720 }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>DA VAGA À ENTREVISTA</SectionLabel>
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: "0 0 16px",
            }}
          >
            Seu diagnóstico pode virar{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              ação
            </em>
            .
          </h2>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.65,
              color: "#45443e",
              margin: "0 auto 32px",
              maxWidth: 560,
            }}
          >
            Depois de entender onde seu currículo ganha ou perde aderência, use
            esse contexto para preparar uma versão direcionada à vaga e
            continuar a candidatura.
          </p>
          <JourneyStrip
            steps={[
              "Radar",
              "Análise",
              "CV adaptado",
              "Candidatura",
              "Preparação",
            ]}
            activeIndex={1}
            hrefs={[
              "/radar-de-vagas",
              undefined,
              undefined,
              "/gestao-de-candidaturas",
              "/preparacao-para-entrevista",
            ]}
          />
        </div>
      </section>

      {/* SEM INVENTAR FATOS */}
      <section style={{ background: "#0a0a0a", padding: "80px 32px" }}>
        <div
          className="reveal-card"
          style={{ ...container, maxWidth: 640, textAlign: "center" }}
        >
          <div style={{ marginBottom: 14 }}>
            <SectionLabel>NOSSO COMPROMISSO</SectionLabel>
          </div>
          <h2
            style={{
              fontFamily: SERIF_ITALIC,
              fontStyle: "italic",
              fontSize: "clamp(26px, 4vw, 38px)",
              fontWeight: 400,
              color: "#fafaf6",
              letterSpacing: -0.4,
              margin: "0 0 16px",
            }}
          >
            A gente reorganiza, destaca e reformula. Nunca inventa.
          </h2>
          <p style={{ fontSize: 15, color: "#a0a098", margin: 0 }}>
            Toda sugestão de ajuste parte do que já existe no seu currículo —
            nenhum cargo, resultado, tecnologia ou certificação é adicionado sem
            ter vindo de você.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{ padding: "110px 32px" }}>
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
                q: "Como funciona o score ATS?",
                a: "Comparamos seu CV com a descrição da vaga e pontuamos de 0 a 100 por seção — experiência, keywords e formatação — mostrando quantos pontos cada ajuste pode render.",
              },
              {
                q: "O earlyCV inventa informação no meu CV?",
                a: "Não. A adaptação reorganiza, destaca e reformula o que já existe no seu currículo — nunca inventa cargo, resultado, tecnologia ou certificação que você não tem.",
              },
              {
                q: "Preciso pagar pra ver o resultado?",
                a: "A análise inicial é grátis. Pra baixar o CV adaptado em PDF/DOCX, você libera a vaga — e ganha de graça a carta de apresentação e a preparação de entrevista dessa candidatura.",
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

      {/* CTA FINAL */}
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
          <Link
            href="/adaptar"
            style={{ ...btnPrimary, background: "#fafaf6", color: "#0a0a0a" }}
          >
            Analisar meu CV grátis →
          </Link>
        </div>
      </section>

      <PublicFooter />
      <LandingSharedStyles />
    </main>
  );
}
