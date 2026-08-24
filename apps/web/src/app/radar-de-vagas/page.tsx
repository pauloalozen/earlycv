import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/public-footer";
import { getAbsoluteUrl } from "@/lib/site";
import {
  BrowserChrome,
  browserFrame,
  btnGhost,
  btnPrimary,
  container,
  GEIST,
  LandingSharedStyles,
  PublicNav,
  SERIF_ITALIC,
  SectionLabel,
} from "../_landing/_shared";
import { LandingScrollAnimations } from "../_landing-scroll-animations";

const url = getAbsoluteUrl("/radar-de-vagas");

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

export const metadata: Metadata = {
  title:
    "Radar de Vagas — Oportunidades com Maior Aderência ao Seu Perfil | EarlyCV",
  description:
    "O Radar EarlyCV encontra vagas de tecnologia em centenas de empresas e mostra primeiro as oportunidades com maior aderência ao seu perfil.",
  alternates: { canonical: url },
  openGraph: {
    title:
      "Radar de Vagas — Oportunidades com Maior Aderência ao Seu Perfil | EarlyCV",
    description:
      "Vagas de tecnologia rastreadas direto na fonte, com aderência calculada pro seu perfil.",
    url,
    type: "website",
  },
  twitter: {
    title:
      "Radar de Vagas — Oportunidades com Maior Aderência ao Seu Perfil | EarlyCV",
    description:
      "Vagas de tecnologia rastreadas direto na fonte, com aderência calculada pro seu perfil.",
  },
};

export default function RadarDeVagasPage() {
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
            PORTAL DE VAGAS · GRÁTIS PRA CRIAR CONTA
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
            Encontre vagas que{" "}
            <em
              style={{
                fontFamily: SERIF_ITALIC,
                fontStyle: "italic",
                fontWeight: 400,
              }}
            >
              realmente combinam
            </em>{" "}
            com seu perfil.
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
            O Radar EarlyCV encontra oportunidades em centenas de empresas e
            mostra primeiro as vagas com maior aderência ao seu perfil — não a
            lista genérica que todo mundo já viu.
          </p>

          <Link href="/radar" style={{ ...btnPrimary, marginBottom: 56 }}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <title>Ver vagas</title>
              <circle cx="12" cy="12" r="2" />
              <path d="M12 12L19 8" />
              <path d="M5 12a7 7 0 0114 0M2.5 12a9.5 9.5 0 0119 0" />
            </svg>
            Ver vagas abertas <span>→</span>
          </Link>

          <div
            className="reveal-card"
            style={{ ...browserFrame, maxWidth: 900, width: "100%" }}
          >
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
        </div>
      </section>

      {/* MARQUEE — prova de cobertura */}
      <section style={{ padding: "72px 0 88px" }}>
        <div
          className="reveal-card"
          style={{ ...container, textAlign: "center", marginBottom: 28 }}
        >
          <SectionLabel>
            VAGAS MAPEADAS ESSA SEMANA EM EMPRESAS COMO
          </SectionLabel>
        </div>
        <div className="lp-marquee-mask reveal-card">
          <div className="lp-marquee-track">
            {COMPANIES.map((name) => (
              <div className="lp-company-badge" key={name}>
                <span>{name}</span>
              </div>
            ))}
            {COMPANIES.map((name) => (
              <div className="lp-company-badge" key={`dup-${name}`} aria-hidden>
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

      {/* ANTES DOS GRANDES PORTAIS */}
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
          <div className="reveal-card">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>NA FONTE, NÃO NO AGREGADOR</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Descubra oportunidades{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                antes dos grandes portais
              </em>
              .
            </h2>
            <p
              style={{
                fontSize: 15.5,
                lineHeight: 1.65,
                color: "#45443e",
                margin: "0 0 24px",
                maxWidth: 440,
              }}
            >
              A gente rastreia vagas direto na fonte — no site e nas plataformas
              de recrutamento de cada empresa. Isso significa que parte das
              vagas pode aparecer no Radar antes de chegar a agregadores como o
              LinkedIn.
            </p>
            <Link href="/radar" style={{ ...btnGhost, paddingLeft: 0 }}>
              Explorar vagas abertas →
            </Link>
          </div>
          <div
            className="reveal-card"
            style={{
              ...browserFrame,
              background: "#0a0a0a",
              padding: 36,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {[
              {
                label: "Fonte da empresa",
                sub: "site oficial · ATS de recrutamento",
              },
              { label: "Radar EarlyCV", sub: "captura e calcula aderência" },
              { label: "Agregadores", sub: "LinkedIn, Indeed e outros" },
            ].map((row, i) => (
              <div
                key={row.label}
                style={{
                  background:
                    i === 1
                      ? "rgba(198,255,58,0.08)"
                      : "rgba(250,250,246,0.06)",
                  border:
                    i === 1
                      ? "1px solid rgba(198,255,58,0.35)"
                      : "1px solid rgba(250,250,246,0.1)",
                  borderRadius: 12,
                  padding: 18,
                }}
              >
                <div
                  style={{
                    color: i === 1 ? "#c6ff3a" : "#fafaf6",
                    fontSize: 14,
                    fontWeight: 500,
                  }}
                >
                  {row.label}
                </div>
                <div style={{ color: "#8a8a85", fontSize: 12, marginTop: 2 }}>
                  {row.sub}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ADERÊNCIA CALCULADA */}
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
          <div className="reveal-card lp-order-1" style={browserFrame}>
            <BrowserChrome />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/landing/f-tile-radar.jpg"
              alt="Aderência à vaga earlyCV"
              width={700}
              height={448}
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </div>
          <div className="reveal-card lp-order-2">
            <div style={{ marginBottom: 12 }}>
              <SectionLabel>ADERÊNCIA, NÃO SÓ PALAVRA-CHAVE</SectionLabel>
            </div>
            <h2
              style={{
                fontSize: "clamp(24px, 3.2vw, 32px)",
                fontWeight: 500,
                letterSpacing: -0.8,
                margin: "0 0 16px",
              }}
            >
              Cada vaga vem com o seu score de compatibilidade.
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
              Área, senioridade, skills e tecnologias — calculados a partir do
              seu currículo assim que você cria conta. As vagas com maior
              aderência aparecem primeiro, não as mais recentes.
            </p>
            <Link href="/radar" style={{ ...btnGhost, paddingLeft: 0 }}>
              Ver minha aderência →
            </Link>
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
            Chegue nas vagas certas primeiro.
          </h2>
          <p style={{ fontSize: 15, color: "#a0a098", margin: "0 0 32px" }}>
            Grátis pra criar conta e ver sua aderência.
          </p>
          <Link
            href="/radar"
            style={{ ...btnPrimary, background: "#fafaf6", color: "#0a0a0a" }}
          >
            Ver vagas abertas →
          </Link>
        </div>
      </section>

      <PublicFooter />
      <LandingSharedStyles />
    </main>
  );
}
