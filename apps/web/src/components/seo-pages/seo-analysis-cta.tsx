"use client";

import { trackSeoPageCtaClicked } from "@/lib/seo-pages/tracking";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function SeoAnalysisCta({
  buttonLabel,
  description,
  location,
  pageType,
  path,
  slug,
  target,
  title,
}: {
  buttonLabel: string;
  description: string;
  location: "bottom" | "hero" | "middle";
  pageType: "hub" | "profession" | "transactional";
  path: string;
  slug: string;
  target: string;
  title: string;
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
        ANÁLISE GRATUITA
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
        {description}
      </div>
      <a
        href={target}
        onClick={() => {
          queueMicrotask(() => {
            void trackSeoPageCtaClicked({
              location,
              pageType,
              path,
              slug,
              target,
            });
          });
        }}
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
      >
        {buttonLabel}
      </a>
    </div>
  );
}
