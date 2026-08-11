"use client";

import { useRouter } from "next/navigation";
import Script from "next/script";
import { useState } from "react";
import { analyzeMasterCvForJob } from "@/lib/analyze-master-cv-flow";
import { useTurnstileToken } from "@/lib/use-turnstile-token";
import { scoreTier } from "./radar-ui";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 13,
        height: 13,
        borderRadius: "50%",
        border: "2px solid rgba(250,250,246,0.35)",
        borderTopColor: "#fafaf6",
        display: "inline-block",
        animation: "analysis-cta-spin 0.7s linear infinite",
      }}
    />
  );
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
        background: "#0a0a0a",
        color: "#fafaf6",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        maxWidth: "calc(100vw - 32px)",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
        fontFamily: GEIST,
        fontSize: 13,
      }}
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        style={{
          background: "none",
          border: "none",
          color: "#8a8a85",
          cursor: "pointer",
          fontSize: 13,
          padding: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function AnalysisCtaButtons({
  isLoggedIn,
  masterResumeId,
  radarJobId,
  jobDescriptionText,
  score,
  secondaryHref,
}: {
  isLoggedIn: boolean;
  masterResumeId: string | null;
  radarJobId: string;
  jobDescriptionText: string;
  score?: number | null;
  secondaryHref: string;
}) {
  const router = useRouter();
  const {
    turnstileSiteKey,
    containerRef: turnstileContainerRef,
    requestToken: requestTurnstileToken,
    onScriptReady: markTurnstileScriptReady,
  } = useTurnstileToken();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const showPrimary = isLoggedIn && !!masterResumeId;
  const hasScore = typeof score === "number";
  const tier = hasScore ? scoreTier(score) : null;

  async function handlePrimaryClick() {
    if (!masterResumeId || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const turnstileToken = await requestTurnstileToken();
      const result = await analyzeMasterCvForJob({
        masterResumeId,
        radarJobId,
        jobDescriptionText,
        turnstileToken,
      });

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      router.push(`/adaptar/resultado?adaptationId=${result.adaptationId}`);
    } catch {
      setError("Falha ao analisar CV. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <>
      {turnstileSiteKey ? (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onReady={markTurnstileScriptReady}
        />
      ) : null}
      <style>{`
        @keyframes analysis-cta-spin { to { transform: rotate(360deg); } }
      `}</style>
      <div
        ref={turnstileContainerRef}
        aria-hidden
        style={{
          position: "fixed",
          left: -10000,
          top: -10000,
          width: 320,
          height: 80,
          pointerEvents: "none",
          opacity: 0,
        }}
      />

      {showPrimary ? (
        <button
          type="button"
          onClick={handlePrimaryClick}
          disabled={loading}
          data-testid="analyze-primary-btn"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            boxSizing: "border-box",
            background: "#0a0a0a",
            color: "#fafaf6",
            border: "none",
            borderRadius: 8,
            padding: "13px 18px",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: loading ? "default" : "pointer",
            opacity: loading ? 0.75 : 1,
            fontFamily: GEIST,
            whiteSpace: "nowrap",
            marginBottom: 8,
            boxShadow:
              hasScore && tier === "high"
                ? "0 0 0 1.5px rgba(47,168,76,0.4), 0 4px 14px rgba(0,0,0,0.14)"
                : "none",
          }}
        >
          {loading ? (
            <Spinner />
          ) : (
            <svg
              aria-hidden
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="#c6ff3a"
            >
              <title>Analisar</title>
              <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
            </svg>
          )}
          {loading ? "Analisando..." : "Analisar meu CV"}
          {!loading && hasScore ? (
            <span style={{ opacity: 0.5, fontFamily: MONO }}>
              · {Math.round(score)}%
            </span>
          ) : null}
        </button>
      ) : null}

      <a
        href={secondaryHref}
        style={
          showPrimary
            ? {
                display: "block",
                width: "100%",
                boxSizing: "border-box",
                background: "#fff",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.15)",
                borderRadius: 9,
                padding: "11px",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                textAlign: "center",
                fontFamily: GEIST,
                marginBottom: 8,
              }
            : {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                width: "100%",
                boxSizing: "border-box",
                background: "#0a0a0a",
                color: "#fafaf6",
                border: "none",
                borderRadius: 8,
                padding: "13px 18px",
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: GEIST,
                marginBottom: 8,
                boxShadow:
                  hasScore && tier === "high"
                    ? "0 0 0 1.5px rgba(47,168,76,0.4), 0 4px 14px rgba(0,0,0,0.14)"
                    : "none",
              }
        }
      >
        Analisar com outro CV
      </a>

      {error ? <Toast message={error} onClose={() => setError(null)} /> : null}
    </>
  );
}
