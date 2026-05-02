"use client";

import { useState } from "react";

const CONFIRM_TEXT = "EXCLUIR MINHA CONTA";

export function DeleteAccountDangerZone({
  creditsRemaining,
}: {
  creditsRemaining: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canConfirm = confirmText.trim() === CONFIRM_TEXT;

  const handleDelete = async () => {
    if (!canConfirm || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/account/delete", {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(
          body?.message?.trim() ||
            "Nao foi possivel excluir sua conta agora. Tente novamente.",
        );
      }
      window.location.assign("/");
    } catch (err) {
      setLoading(false);
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Nao foi possivel excluir sua conta agora. Tente novamente.",
      );
    }
  };

  return (
    <section
      style={{
        background: "#ffffff",
        border: "1px solid rgba(239,68,68,0.18)",
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9.5,
          letterSpacing: 1,
          color: "#b45353",
          margin: "0 0 6px",
          fontWeight: 500,
        }}
      >
        ZONA DE PERIGO
      </p>
      <h3
        style={{
          margin: "0 0 4px",
          fontSize: 16,
          fontWeight: 500,
          color: "#8f2b2b",
        }}
      >
        Excluir conta permanentemente
      </h3>
      <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "#8f2b2b" }}>
        Esta acao remove sua conta, historico de analises, CVs adaptados e dados
        associados. Nao e possivel desfazer.
      </p>

      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setError(null);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          borderRadius: 10,
          border: "1px solid rgba(153,27,27,0.28)",
          background: "#991b1b",
          color: "#ffffff",
          padding: "10px 14px",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Excluir</title>
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
          </svg>
        </span>
        Solicitar exclusao da conta
      </button>

      {open && (
        <div
          style={{
            marginTop: 14,
            background: "#fffafa",
            border: "1px solid rgba(239,68,68,0.18)",
            borderRadius: 10,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <p style={{ margin: 0, fontSize: 12.5, color: "#8f2b2b" }}>
            Para confirmar, digite <strong>{CONFIRM_TEXT}</strong> no campo
            abaixo.
          </p>
          {creditsRemaining > 0 && (
            <p style={{ margin: 0, fontSize: 12.5, color: "#8f2b2b" }}>
              Voce ainda possui {creditsRemaining} credito(s). Ao excluir sua
              conta, esses creditos serao perdidos.
            </p>
          )}
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder={CONFIRM_TEXT}
            style={{
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.14)",
              padding: "10px 12px",
              fontSize: 13,
              width: "100%",
              boxSizing: "border-box",
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!canConfirm || loading}
              style={{
                borderRadius: 9,
                border: "none",
                background: "#991b1b",
                color: "#fff",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: !canConfirm || loading ? "default" : "pointer",
                opacity: !canConfirm || loading ? 0.6 : 1,
              }}
            >
              {loading ? "Excluindo conta..." : "Excluir minha conta"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={loading}
              style={{
                borderRadius: 9,
                border: "1px solid rgba(10,10,10,0.16)",
                background: "#fff",
                color: "#0a0a0a",
                padding: "10px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: loading ? "default" : "pointer",
              }}
            >
              Cancelar
            </button>
          </div>
          {error && (
            <p
              style={{
                margin: 0,
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 11.5,
                color: "#b91c1c",
              }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
