import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { getAbsoluteUrl } from "@/lib/site";
import { GestaoMock } from "../_landing/_feature-showcase";
import {
  BrowserChrome,
  browserFrame,
  btnPrimary,
  container,
  FlowDiagram,
  GEIST,
  LandingSharedStyles,
  PublicNav,
  SERIF_ITALIC,
  SectionLabel,
} from "../_landing/_shared";
import { LandingScrollAnimations } from "../_landing-scroll-animations";

const url = getAbsoluteUrl("/gestao-de-candidaturas");

export const metadata: Metadata = {
  title:
    "Gestão de Candidaturas — Pare de Perder o Controle das Suas Vagas | EarlyCV",
  description:
    "Suas candidaturas não precisam viver numa planilha. Acompanhe vaga salva, CV usado, status, entrevista e preparação — tudo num só lugar, conectado.",
  alternates: { canonical: url },
  openGraph: {
    title:
      "Gestão de Candidaturas — Pare de Perder o Controle das Suas Vagas | EarlyCV",
    description:
      "Acompanhe cada candidatura num só lugar — vaga, CV, status, entrevista e preparação.",
    url,
    type: "website",
  },
  twitter: {
    title:
      "Gestão de Candidaturas — Pare de Perder o Controle das Suas Vagas | EarlyCV",
    description:
      "Acompanhe cada candidatura num só lugar — vaga, CV, status, entrevista e preparação.",
  },
};

const TRACKED_FIELDS = [
  "Vaga salva",
  "Currículo usado",
  "Status da candidatura",
  "Entrevista",
  "Anotações",
  "Preparação",
  "Resultado",
] as const;

export default function GestaoDeCandidaturasPage() {
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
            GRÁTIS · UM LUGAR SÓ PRA TODAS AS SUAS VAGAS
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
            Suas candidaturas não precisam{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              viver numa planilha
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
            Pare de perder o controle das vagas em que você se candidatou. O
            EarlyCV guarda a vaga, o CV que você usou, o status, as anotações da
            entrevista e a preparação — tudo junto.
          </p>

          <Link
            href="/candidaturas"
            style={{ ...btnPrimary, marginBottom: 56 }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Organizar candidaturas</title>
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 14h3" />
            </svg>
            Organizar minhas candidaturas <span>→</span>
          </Link>

          <div
            className="reveal-card"
            style={{
              width: "100%",
              maxWidth: 900,
              background: "#0a0a0a",
              borderRadius: 16,
              padding: "36px 28px",
              boxShadow: "0 30px 70px -24px rgba(10,10,10,0.35)",
            }}
          >
            <div style={{ marginBottom: 20 }}>
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10.5,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#8a8a85",
                }}
              >
                cada candidatura, do início ao fim
              </span>
            </div>
            <FlowDiagram
              variant="dark"
              steps={[
                "Vaga",
                "Análise",
                "CV adaptado",
                "Candidatura",
                "Preparação de entrevista",
              ]}
            />
          </div>
        </div>
      </section>

      {/* É ASSIM QUE FICA */}
      <section style={{ padding: "70px 32px 0" }}>
        <div style={{ ...container, maxWidth: 900 }}>
          <div
            className="reveal-card"
            style={{ textAlign: "center", marginBottom: 24 }}
          >
            <SectionLabel>É ASSIM QUE FICA</SectionLabel>
          </div>
          <div className="reveal-card" style={browserFrame}>
            <BrowserChrome />
            <GestaoMock />
          </div>
        </div>
      </section>

      {/* O QUE FICA GUARDADO */}
      <section style={{ padding: "100px 32px" }}>
        <div style={{ ...container, textAlign: "center", marginBottom: 40 }}>
          <div className="reveal-card" style={{ marginBottom: 10 }}>
            <SectionLabel>NADA SE PERDE</SectionLabel>
          </div>
          <h2
            className="reveal-card"
            style={{
              fontSize: "clamp(26px, 4vw, 40px)",
              fontWeight: 500,
              letterSpacing: -1.2,
              margin: "0 auto",
              maxWidth: 620,
            }}
          >
            Sete coisas que você não precisa mais lembrar de cabeça.
          </h2>
        </div>
        <div
          className="lp-grid-3"
          style={{
            ...container,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
          }}
        >
          {TRACKED_FIELDS.map((field) => (
            <div
              key={field}
              className="reveal-card"
              style={{
                background: "#fafaf6",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 14,
                padding: "20px 18px",
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#84cc16"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Incluído</title>
                <path d="M5 12l5 5L20 7" />
              </svg>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{field}</span>
            </div>
          ))}
        </div>
      </section>

      {/* DIFERENCIAL: TUDO CONECTADO */}
      <section style={{ background: "#0a0a0a", padding: "90px 32px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", maxWidth: 720 }}
        >
          <div style={{ marginBottom: 14 }}>
            <SectionLabel>O DIFERENCIAL NÃO É UM KANBAN</SectionLabel>
          </div>
          <h2
            style={{
              fontFamily: SERIF_ITALIC,
              fontStyle: "italic",
              fontSize: "clamp(26px, 4.2vw, 40px)",
              fontWeight: 400,
              color: "#fafaf6",
              letterSpacing: -0.4,
              margin: "0 0 20px",
            }}
          >
            É tudo estar conectado.
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "#a0a098",
              margin: "0 0 40px",
              maxWidth: 560,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Um quadro de status qualquer organiza cartões. O EarlyCV conecta
            cada candidatura à análise que a gerou, ao CV que foi usado e à
            preparação de entrevista — sem você ter que copiar e colar nada
            entre ferramentas.
          </p>
          <FlowDiagram
            variant="dark"
            steps={["Vaga", "Análise", "CV", "Candidatura", "Preparação"]}
          />
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
            Sua próxima candidatura já começa organizada.
          </h2>
          <p style={{ fontSize: 15, color: "#45443e", margin: "0 0 32px" }}>
            Grátis, direto na sua conta EarlyCV.
          </p>
          <Link href="/candidaturas" style={btnPrimary}>
            Organizar minhas candidaturas →
          </Link>
        </div>
      </section>

      <PublicFooter />
      <LandingSharedStyles />
    </main>
  );
}
