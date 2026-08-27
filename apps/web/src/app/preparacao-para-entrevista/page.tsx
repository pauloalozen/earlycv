import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { getAbsoluteUrl } from "@/lib/site";
import { PreparacaoMock } from "../_landing/_feature-showcase";
import {
  GEIST_V2 as GEIST,
  LandingNavV2,
  SERIF_ITALIC_V2 as SERIF_ITALIC,
} from "../_landing/_nav-v2";
import {
  BrowserChrome,
  browserFrame,
  btnPrimary,
  container,
  FlowDiagram,
  JourneyStrip,
  LandingSharedStyles,
  SectionLabel,
} from "../_landing/_shared";
import { LandingScrollAnimations } from "../_landing-scroll-animations";

const url = getAbsoluteUrl("/preparacao-para-entrevista");

export const metadata: Metadata = {
  title:
    "Como se Preparar para Entrevista de Emprego — Roteiro Personalizado | EarlyCV",
  description:
    "Prepare-se para a entrevista daquela vaga, não para uma entrevista genérica. Perguntas técnicas, comportamentais e um roteiro personalizado a partir do seu currículo e da vaga.",
  alternates: { canonical: url },
  openGraph: {
    title:
      "Como se Preparar para Entrevista de Emprego — Roteiro Personalizado | EarlyCV",
    description:
      "Roteiro de entrevista personalizado a partir do seu currículo, da vaga e da empresa.",
    url,
    type: "website",
  },
  twitter: {
    title:
      "Como se Preparar para Entrevista de Emprego — Roteiro Personalizado | EarlyCV",
    description:
      "Roteiro de entrevista personalizado a partir do seu currículo, da vaga e da empresa.",
  },
};

const CATEGORIES = [
  {
    title: "Perguntas técnicas",
    body: "As mais prováveis pra sua senioridade e stack, com base no que a vaga pede.",
    icon: (
      <>
        <path d="M8 9l-3 3 3 3M16 9l3 3-3 3M13 6l-2 12" />
      </>
    ),
  },
  {
    title: "Perguntas comportamentais",
    body: "Situações que a empresa provavelmente vai explorar, com base no perfil da vaga.",
    icon: (
      <>
        <path d="M8 10h8M8 14h5" />
        <path d="M4 4h16v13H8l-4 3V4z" />
      </>
    ),
  },
  {
    title: "Pontos do seu CV",
    body: "O que no seu currículo tem mais chance de virar pergunta — pra você chegar pronto.",
    icon: (
      <>
        <path d="M4 4h16v16H4z" />
        <path d="M4 4l8 8 8-8" />
      </>
    ),
  },
  {
    title: "Como apresentar suas experiências",
    body: "Roteiro de como contar cada experiência real de forma clara e conectada à vaga.",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20a7 7 0 0114 0" />
      </>
    ),
  },
  {
    title: "Perguntas pro entrevistador",
    body: "Sugestões de perguntas que mostram que você entendeu a vaga e a empresa.",
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2 2-2 3.5M12 16.5h.01" />
      </>
    ),
  },
] as const;

const FAQ = [
  {
    q: "Como se preparar para uma entrevista de emprego?",
    a: "Comece revisando os requisitos da vaga e conectando com experiências reais do seu currículo. O EarlyCV faz esse cruzamento pra você e monta um roteiro com as perguntas mais prováveis, técnicas e comportamentais, pra aquela vaga específica.",
  },
  {
    q: "Quais são as perguntas mais comuns em entrevistas comportamentais?",
    a: "Costumam pedir situações reais: um conflito que você resolveu, uma decisão difícil, um erro e o que aprendeu com ele. O roteiro do EarlyCV já vem com exemplos adaptados ao que a vaga valoriza.",
  },
  {
    q: "O que perguntar para o entrevistador no final?",
    a: "Perguntas que mostram que você entendeu a vaga — sobre o time, os desafios do momento ou como o sucesso na posição é medido — costumam render melhor que perguntas genéricas sobre benefícios.",
  },
  {
    q: "A preparação de entrevista tem custo?",
    a: "Não. Depois que você desbloqueia o CV adaptado pra uma vaga, a preparação de entrevista dessa candidatura sai de graça, junto com a carta de apresentação.",
  },
] as const;

export default function PreparacaoParaEntrevistaPage() {
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
            GRÁTIS APÓS DESBLOQUEAR SUA VAGA
          </div>

          <h1
            style={{
              fontSize: "clamp(32px, 6vw, 54px)",
              fontWeight: 500,
              letterSpacing: -2,
              lineHeight: 1.06,
              margin: "0 0 22px",
            }}
          >
            Prepare-se para{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              a entrevista daquela vaga
            </em>
            , não para uma entrevista genérica.
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
            Cada empresa, cada vaga e cada entrevistador esperam coisas
            diferentes. O EarlyCV cruza seu currículo com a descrição da vaga e
            monta um roteiro personalizado — não uma lista genérica de perguntas
            de internet.
          </p>

          <Link href="/adaptar" style={{ ...btnPrimary, marginBottom: 56 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <title>Preparar entrevista</title>
              <path d="M12 2a5 5 0 015 5v3a5 5 0 01-10 0V7a5 5 0 015-5z" />
              <path d="M19 10v1a7 7 0 01-14 0v-1M12 21v-4" />
            </svg>
            Preparar minha entrevista <span>→</span>
          </Link>

          <div
            className="reveal-card"
            style={{ ...browserFrame, maxWidth: 1000, width: "100%" }}
          >
            <BrowserChrome />
            <PreparacaoMock />
          </div>
        </div>
      </section>

      {/* FÓRMULA DE PERSONALIZAÇÃO */}
      <section style={{ padding: "0 32px 100px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 760 }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>COMO É PERSONALIZADO DE VERDADE</SectionLabel>
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: "0 0 16px",
            }}
          >
            Você não começa a preparação do zero.
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
            O EarlyCV já conhece a vaga, seu currículo e os pontos de aderência
            encontrados na análise. Esse contexto vira estratégia de entrevista
            — currículo, vaga e empresa juntos, não uma lista genérica de
            perguntas.
          </p>
          <FlowDiagram
            steps={[
              "Vaga + CV",
              "Análise",
              "A empresa",
              "Roteiro personalizado",
            ]}
          />
        </div>
      </section>

      {/* CATEGORIAS */}
      <section style={{ padding: "0 32px 110px" }}>
        <div style={{ ...container, marginBottom: 32 }}>
          <div className="reveal-card" style={{ marginBottom: 10 }}>
            <SectionLabel>O QUE VEM NO ROTEIRO</SectionLabel>
          </div>
          <h2
            className="reveal-card"
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: 0,
              maxWidth: 640,
            }}
          >
            Cinco frentes, cobertas de uma vez.
          </h2>
        </div>
        <div
          className="lp-grid-3"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 20,
          }}
        >
          {CATEGORIES.map((c) => (
            <div key={c.title} className="lp-feature-tile reveal-card">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: "#0a0a0a",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#c6ff3a"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>{c.title}</title>
                  {c.icon}
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
                  {c.title}
                </div>
                <div
                  style={{ fontSize: 13, color: "#6a6a66", lineHeight: 1.45 }}
                >
                  {c.body}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PRÓXIMA PREPARAÇÃO: HISTÓRICO DE ENTREVISTAS ANTERIORES */}
      <section style={{ padding: "0 32px 110px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 680 }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>NADA SE PERDE, NEM O APRENDIZADO</SectionLabel>
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: "0 0 16px",
            }}
          >
            Sua próxima preparação{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              não começa do zero
            </em>
            .
          </h2>
          <p
            style={{
              fontSize: 15.5,
              lineHeight: 1.65,
              color: "#45443e",
              margin: "0 auto 28px",
              maxWidth: 560,
            }}
          >
            Se um ponto apareceu como dificuldade ou feedback em uma entrevista
            anterior, esse histórico pode ser considerado nas próximas
            preparações.
          </p>
          <FlowDiagram
            steps={["Entrevista", "Feedback", "Próxima preparação"]}
          />
        </div>
      </section>

      {/* JORNADA: DA VAGA À ENTREVISTA */}
      <section style={{ padding: "0 32px 110px" }}>
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
            Da vaga à entrevista,{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              sem recomeçar a cada etapa
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
            Encontrar a oportunidade, entender sua aderência, preparar o
            currículo e acompanhar a candidatura constroem o contexto que chega
            com você até a preparação da entrevista.
          </p>
          <JourneyStrip
            steps={[
              "Radar",
              "Análise",
              "CV adaptado",
              "Candidatura",
              "Preparação",
            ]}
            activeIndex={4}
            hrefs={[
              "/radar-de-vagas",
              "/analise-de-curriculo",
              undefined,
              "/gestao-de-candidaturas",
              undefined,
            ]}
          />
        </div>
      </section>

      {/* FAQ — cluster SEO */}
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
              Dúvidas comuns sobre entrevista.
            </h2>
          </div>
          <div style={{ marginTop: 24 }}>
            {FAQ.map((item) => (
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
            Chegue na entrevista sabendo o que esperar.
          </h2>
          <p style={{ fontSize: 15, color: "#a0a098", margin: "0 0 32px" }}>
            Grátis após desbloquear o CV adaptado pra sua vaga.
          </p>
          <Link
            href="/adaptar"
            style={{ ...btnPrimary, background: "#fafaf6", color: "#0a0a0a" }}
          >
            Preparar minha entrevista →
          </Link>
        </div>
      </section>

      <PublicFooter />
      <LandingSharedStyles />

      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: static structured data
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQ.map((item) => ({
              "@type": "Question",
              name: item.q,
              acceptedAnswer: {
                "@type": "Answer",
                text: item.a,
              },
            })),
          }),
        }}
      />
    </main>
  );
}
