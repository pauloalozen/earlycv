"use client";

import Link from "next/link";
import { openAnalyticsConsentPreferences } from "@/lib/analytics-consent";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const footerColumns = [
  {
    label: "PRODUTO",
    links: [
      { href: "/adaptar", label: "Análise gratuita" },
      { href: "/adaptar-curriculo-para-vaga", label: "Adaptar currículo" },
      { href: "/curriculo-ats", label: "Currículo ATS" },
      { href: "/palavras-chave-curriculo", label: "Palavras-chave" },
    ],
  },
  {
    label: "APRENDER",
    links: [
      { href: "/blog", label: "Blog" },
      {
        href: "/blog/como-adaptar-curriculo-para-vaga",
        label: "Como adaptar currículo",
      },
      { href: "/blog/curriculo-ats", label: "Currículo ATS (artigo)" },
      {
        href: "/blog/palavras-chave-curriculo",
        label: "Palavras-chave (artigo)",
      },
    ],
  },
  {
    label: "RECURSOS",
    links: [
      { href: "/modelo-curriculo-ats", label: "Modelo de currículo ATS" },
      { href: "/curriculo-gupy", label: "Currículo para Gupy" },
      { href: "/contato", label: "Contato" },
      { href: "/demo-resultado", label: "Demo de resultado" },
    ],
  },
  {
    label: "LEGAL",
    links: [
      { href: "/privacidade", label: "Privacidade" },
      { href: "/termos-de-uso", label: "Termos de uso" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer
      style={{
        background: "#0a0a0a",
        color: "#fafaf6",
        position: "relative",
        overflow: "hidden",
        fontFamily: GEIST,
        marginTop: 0,
      }}
    >
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          backgroundImage: GRAIN,
        }}
      />

      {/* CTA strip */}
      <div
        style={{
          borderBottom: "1px solid rgba(250,250,246,0.06)",
          padding: "40px 10%",
          display: "flex",
          flexWrap: "wrap",
          gap: 16,
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          zIndex: 1,
        }}
      >
        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            letterSpacing: -0.7,
            color: "#fafaf6",
          }}
        >
          Se a vaga importa, seu currículo não pode ser genérico.
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
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            maxWidth: "100%",
            whiteSpace: "normal",
          }}
        >
          Começar análise grátis agora →
        </Link>
      </div>

      {/* Links grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: 40,
          padding: "40px 10% 32px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {footerColumns.map((col) => (
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
            {col.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  display: "block",
                  fontSize: 13.5,
                  color: "#a0a098",
                  textDecoration: "none",
                  marginBottom: 10,
                  lineHeight: 1.4,
                }}
              >
                {link.label}
              </Link>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          justifyContent: "space-between",
          padding: "16px 10%",
          borderTop: "1px solid rgba(250,250,246,0.06)",
          position: "relative",
          zIndex: 1,
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#4a4a48",
            letterSpacing: 0.3,
          }}
        >
          Dados protegidos conforme LGPD
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#4a4a48",
            letterSpacing: 0.3,
          }}
        >
          EarlyCV © 2026
        </span>
        <button
          type="button"
          onClick={openAnalyticsConsentPreferences}
          style={{
            fontFamily: MONO,
            fontSize: 11,
            color: "#6a6a66",
            letterSpacing: 0.3,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          Preferências de cookies
        </button>
      </div>
    </footer>
  );
}
