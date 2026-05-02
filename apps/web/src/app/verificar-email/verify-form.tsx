"use client";

import { useEffect, useState } from "react";
import { CodeInput } from "./code-input";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const TOTAL_SECONDS = 5 * 60;
const RESEND_DELAY = 30;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type Props = {
  next: string;
  isResultFlow: boolean;
  error?: string;
  resent?: string;
  userEmail?: string;
};

export function VerifyForm({
  next,
  isResultFlow,
  error,
  resent,
  userEmail,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const resendReady = resendCountdown === 0;
  const expired = secondsLeft === 0;

  return (
    <>
      {/* Kicker */}
      {isResultFlow && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontFamily: MONO,
              fontSize: 10.5,
              letterSpacing: 1.2,
              fontWeight: 500,
              color: "#555",
              background: "rgba(10,10,10,0.04)",
              border: "1px solid rgba(10,10,10,0.06)",
              padding: "6px 12px",
              borderRadius: 999,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#c6ff3a",
                boxShadow: "0 0 6px #c6ff3a",
                display: "inline-block",
                animation: "ve-pulse 1.4s infinite",
              }}
            />
            ÚLTIMO PASSO PARA VER SUA ANÁLISE
          </div>
        </div>
      )}

      {/* Heading */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1
          style={{
            fontFamily: GEIST,
            fontSize: 24,
            fontWeight: 500,
            letterSpacing: -0.9,
            color: "#0a0a0a",
            margin: "0 0 8px",
            lineHeight: 1.1,
          }}
        >
          {isResultFlow
            ? "Confirme seu email para liberar sua análise"
            : "Verifique seu email"}
        </h1>
        <p
          style={{
            fontFamily: GEIST,
            fontSize: 14,
            color: "#6a6560",
            lineHeight: 1.55,
            margin: 0,
          }}
        >
          Enviamos um código de 6 dígitos para{" "}
          <span style={{ color: "#0a0a0a", fontWeight: 500 }}>{userEmail}</span>
        </p>
      </div>

      {/* Timer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 7,
          marginBottom: 24,
        }}
      >
        {expired ? (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 12,
              fontWeight: 600,
              color: "#ef4444",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.15)",
              borderRadius: 8,
              padding: "5px 12px",
            }}
          >
            Código expirado
          </span>
        ) : (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "rgba(198,255,58,0.12)",
              border: "1px solid rgba(110,150,20,0.2)",
              borderRadius: 8,
              padding: "5px 12px",
            }}
          >
            <svg
              aria-hidden="true"
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#405410"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 12,
                fontWeight: 600,
                color: "#405410",
              }}
            >
              Válido por{" "}
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {fmt(secondsLeft)}
              </span>
            </span>
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          style={{
            marginBottom: 16,
            background: "rgba(239,68,68,0.06)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            fontFamily: GEIST,
            fontSize: 13.5,
            color: "#991b1b",
            lineHeight: 1.5,
          }}
        >
          {error}
        </div>
      )}

      {/* Resent confirmation */}
      {resent && (
        <div
          style={{
            marginBottom: 16,
            background: "rgba(198,255,58,0.1)",
            border: "1px solid rgba(110,150,20,0.2)",
            borderRadius: 10,
            padding: "12px 16px",
            fontFamily: GEIST,
            fontSize: 13.5,
            color: "#2a3a08",
            lineHeight: 1.5,
          }}
        >
          Novo código enviado para seu email.
        </div>
      )}

      {/* Code input + submit */}
      <form
        action="/auth/verify-email"
        method="post"
        style={{ display: "flex", flexDirection: "column", gap: 20 }}
      >
        {next && <input type="hidden" name="next" value={next} />}

        <CodeInput name="code" />

        <button
          type="submit"
          style={{
            fontFamily: GEIST,
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 12,
            background: "#0a0a0a",
            color: "#fff",
            border: "none",
            padding: "15px 20px",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
            letterSpacing: -0.2,
            transition: "background 150ms",
          }}
        >
          {isResultFlow ? (
            <>
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              Liberar análise completa
            </>
          ) : (
            <>
              <svg
                aria-hidden="true"
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Confirmar código
            </>
          )}
        </button>
      </form>

      {/* Divider */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "24px 0 0",
        }}
      >
        <div
          style={{ flex: 1, height: 1, background: "rgba(10,10,10,0.07)" }}
        />
        <span
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "rgba(10,10,10,0.3)",
            letterSpacing: 0.5,
          }}
        >
          ou
        </span>
        <div
          style={{ flex: 1, height: 1, background: "rgba(10,10,10,0.07)" }}
        />
      </div>

      {/* Resend */}
      <form
        action="/auth/resend-verification"
        method="post"
        style={{ marginTop: 14 }}
      >
        <button
          type="submit"
          disabled={!resendReady}
          style={{
            fontFamily: GEIST,
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            borderRadius: 12,
            background: "transparent",
            color: resendReady ? "#45443e" : "rgba(10,10,10,0.3)",
            border: "1px solid rgba(10,10,10,0.1)",
            padding: "13px 20px",
            fontSize: 13.5,
            fontWeight: 500,
            cursor: resendReady ? "pointer" : "not-allowed",
            transition: "all 150ms",
            opacity: resendReady ? 1 : 0.55,
          }}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
          </svg>
          {resendReady
            ? "Não recebeu? Reenviar o código"
            : `Não recebeu? Reenviar em ${resendCountdown}s`}
        </button>
      </form>

      <style>{`
        @keyframes ve-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
