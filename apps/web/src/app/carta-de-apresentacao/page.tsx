import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { getAbsoluteUrl } from "@/lib/site";
import {
  btnPrimary,
  container,
  FlowDiagram,
  GEIST,
  LandingSharedStyles,
  MONO,
  PublicNav,
  SERIF_ITALIC,
  SectionLabel,
} from "../_landing/_shared";
import { LandingScrollAnimations } from "../_landing-scroll-animations";

const url = getAbsoluteUrl("/carta-de-apresentacao");

export const metadata: Metadata = {
  title: "Carta de Apresentação Personalizada para Cada Vaga | EarlyCV",
  description:
    "Não envie a mesma carta pra toda empresa. O EarlyCV gera uma carta de apresentação personalizada a partir do seu currículo e da vaga — sem inventar experiências.",
  alternates: { canonical: url },
  openGraph: {
    title: "Carta de Apresentação Personalizada para Cada Vaga | EarlyCV",
    description:
      "Carta de apresentação gerada a partir do seu currículo e da vaga — sem inventar experiências.",
    url,
    type: "website",
  },
  twitter: {
    title: "Carta de Apresentação Personalizada para Cada Vaga | EarlyCV",
    description:
      "Carta de apresentação gerada a partir do seu currículo e da vaga — sem inventar experiências.",
  },
};

export default function CartaDeApresentacaoPage() {
  return (
    <main
      style={{ fontFamily: GEIST, color: "#0a0a0a", background: "#ffffff" }}
    >
      <LandingScrollAnimations />
      <PublicNav />

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
          <div className="lp-kicker" style={{ marginBottom: 26 }}>
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
              fontSize: "clamp(34px, 6.4vw, 58px)",
              fontWeight: 500,
              letterSpacing: -2.2,
              lineHeight: 1.04,
              margin: "0 0 22px",
            }}
          >
            Crie uma carta de apresentação{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              personalizada
            </em>{" "}
            para cada vaga.
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
            Não envie a mesma carta pra toda empresa. O EarlyCV usa seu
            currículo real e a descrição da vaga pra escrever uma carta que fala
            com aquele recrutador, não com qualquer um.
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
              <title>Criar carta</title>
              <path d="M4 4h16v16H4z" />
              <path d="M4 4l8 8 8-8" />
            </svg>
            Criar minha carta <span>→</span>
          </Link>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section style={{ padding: "0 32px 100px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 720 }}
        >
          <div style={{ marginBottom: 12 }}>
            <SectionLabel>COMO FUNCIONA</SectionLabel>
          </div>
          <h2
            style={{
              fontSize: "clamp(24px, 3.4vw, 34px)",
              fontWeight: 500,
              letterSpacing: -1,
              margin: "0 0 32px",
            }}
          >
            Seu currículo + a vaga viram uma carta de verdade.
          </h2>
          <FlowDiagram
            steps={[
              "Seu currículo",
              "Descrição da vaga",
              "EarlyCV",
              "Carta personalizada",
            ]}
          />
        </div>
      </section>

      {/* EXEMPLO */}
      <section style={{ padding: "0 32px 110px" }}>
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
              <SectionLabel>NA PRÁTICA</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Um exemplo{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                ilustrativo
              </em>{" "}
              do resultado.
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
              A carta puxa suas experiências reais e conecta com o que a vaga
              pede — sem frases genéricas de modelo pronto.
            </p>
          </div>
          <div
            className="reveal-card"
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 16,
              padding: "32px 30px",
              boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1,
                textTransform: "uppercase",
                color: "#8a8a85",
                marginBottom: 16,
              }}
            >
              exemplo ilustrativo
            </div>
            <p
              style={{
                fontSize: 14.5,
                lineHeight: 1.75,
                color: "#3a3a38",
                margin: 0,
              }}
            >
              "Nos últimos três anos, liderei a migração de pipelines de dados
              que reduziu o tempo de processamento em 30% — exatamente o tipo de
              ganho de eficiência que vejo destacado na vaga de Engenheira de
              Dados Sênior na [Empresa]. Tenho experiência prática com Python,
              Airflow e AWS, as mesmas tecnologias citadas na descrição, e
              gostaria de conversar sobre como posso contribuir com o time..."
            </p>
          </div>
        </div>
      </section>

      {/* SEM INVENTAR EXPERIÊNCIAS */}
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
            Sem inventar experiências.
          </h2>
          <p style={{ fontSize: 15, color: "#a0a098", margin: 0 }}>
            A carta usa só o que está no seu currículo — a mesma regra vale pra
            adaptação de CV, preparação de entrevista e qualquer outro texto que
            o EarlyCV gera pra você.
          </p>
        </div>
      </section>

      {/* CTA FINAL */}
      <section style={{ padding: "90px 32px" }}>
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
              letterSpacing: -0.5,
              margin: "0 0 18px",
            }}
          >
            Sua próxima carta não precisa começar do zero.
          </h2>
          <p style={{ fontSize: 15, color: "#45443e", margin: "0 0 32px" }}>
            Grátis após desbloquear o CV adaptado pra sua vaga.
          </p>
          <Link href="/adaptar" style={btnPrimary}>
            Criar minha carta →
          </Link>
        </div>
      </section>

      <PublicFooter />
      <LandingSharedStyles />
    </main>
  );
}
