"use client";

import { useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const EMAIL = "contato@earlycv.com.br";

export function CopyEmail() {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(EMAIL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        background: "rgba(10,10,10,0.04)",
        border: "1px solid rgba(10,10,10,0.08)",
        borderRadius: 12,
        padding: "14px 18px",
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 14,
          color: "#0a0a0a",
          fontWeight: 500,
          letterSpacing: -0.2,
        }}
      >
        {EMAIL}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: copied ? "#405410" : "#0a0a0a",
          color: copied ? "#c6ff3a" : "#fafaf6",
          border: "none",
          borderRadius: 8,
          padding: "7px 14px",
          fontSize: 12.5,
          fontWeight: 500,
          fontFamily: GEIST,
          cursor: "pointer",
          transition: "background 180ms, color 180ms",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        {copied ? (
          <>
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Copiado
          </>
        ) : (
          <>
            <svg
              aria-hidden="true"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copiar
          </>
        )}
      </button>
    </div>
  );
}
