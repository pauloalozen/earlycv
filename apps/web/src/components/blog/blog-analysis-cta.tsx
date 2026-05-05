"use client";

import Link from "next/link";

import { trackBlogCtaClicked } from "@/lib/blog/tracking";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function BlogAnalysisCta({
  location,
  slug,
  title = "Compare seu CV com a vaga em minutos",
  sub = "Veja lacunas, pontos fortes e ajustes possíveis sem inventar informações.",
  kicker = "ANÁLISE GRATUITA",
}: {
  location: "top" | "middle" | "bottom" | "index";
  slug?: string;
  title?: string;
  sub?: string;
  kicker?: string;
}) {
  return (
    <div
      style={{
        background: "#0a0a0a",
        borderRadius: 14,
        padding: "28px 32px",
        margin: "48px 0",
        fontFamily: GEIST,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#7a7a74",
          marginBottom: 12,
          fontWeight: 500,
        }}
      >
        {kicker}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: "#fafaf6",
          letterSpacing: -0.8,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 14,
          color: "#a0a098",
          marginBottom: 20,
          lineHeight: 1.5,
        }}
      >
        {sub}
      </div>
      <Link
        href="/adaptar"
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "#c6ff3a",
          color: "#0a0a0a",
          borderRadius: 8,
          padding: "11px 18px",
          fontSize: 13.5,
          fontWeight: 600,
          textDecoration: "none",
          fontFamily: GEIST,
        }}
        onClick={() => {
          void trackBlogCtaClicked({
            cta_id: "blog_analysis_cta_adaptar",
            cta_label: "Adaptar meu CV",
            cta_location: location,
            cta_text: "Adaptar meu CV →",
            href: "/adaptar",
            slug,
            target_url: "/adaptar",
            title,
          });
        }}
      >
        Adaptar meu CV →
      </Link>
    </div>
  );
}
