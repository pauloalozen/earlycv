"use client";

import { useState } from "react";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export default function EsqueceuSenhaPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Erro");
      }
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar o email. Tente novamente.");
      setStatus("error");
    }
  };

  return (
    <AuthMonoShell>
      {status === "done" ? (
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(198,255,58,0.2)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#405410" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, letterSpacing: -0.5, color: "#0a0a0a", margin: "0 0 8px" }}>Email enviado</h1>
          <p style={{ fontSize: 13.5, color: "#6a6560", lineHeight: 1.55, margin: "0 0 20px" }}>
            Se existe uma conta com <strong style={{ color: "#0a0a0a" }}>{email}</strong>, você receberá um link para redefinir sua senha em instantes.
          </p>
          <a href="/entrar?tab=entrar" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, color: "#0a0a0a", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
            Voltar para o login
          </a>
        </div>
      ) : (
        <>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: -0.7, color: "#0a0a0a", margin: "0 0 6px" }}>Esqueceu sua senha?</h1>
          <p style={{ fontSize: 13.5, color: "#6a6560", lineHeight: 1.5, margin: "0 0 24px" }}>
            Informe seu email e enviaremos um link para criar uma nova senha.
          </p>

          {error && (
            <div style={{ marginBottom: 16, padding: "10px 14px", background: "#fee2e2", border: "1px solid #fecaca", borderRadius: 8, fontFamily: MONO, fontSize: 12, color: "#991b1b" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label htmlFor="forgot-password-email" style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#7a7a74", fontWeight: 500, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                id="forgot-password-email"
                type="email"
                required
                autoComplete="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", background: "#fff", border: "1px solid #d8d6ce", borderRadius: 8, padding: "11px 13px", fontSize: 13.5, color: "#0a0a0a", outline: "none", boxSizing: "border-box", transition: "border-color 150ms" }}
                className="entrar-input"
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              style={{ width: "100%", background: "#0a0a0a", color: "#fafaf6", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 500, cursor: (status === "loading" || !email.trim()) ? "default" : "pointer", letterSpacing: -0.2, opacity: (status === "loading" || !email.trim()) ? 0.45 : 1, transition: "opacity 150ms", fontFamily: GEIST }}
            >
              {status === "loading" ? "Enviando..." : "Enviar link de redefinição"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: 13, color: "#6a6560", marginTop: 20 }}>
            Lembrou a senha?{" "}
            <a href="/entrar?tab=entrar" style={{ color: "#0a0a0a", fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>Entrar</a>
          </p>
        </>
      )}
      <style>{`.entrar-input:focus { border-color: #0a0a0a !important; }`}</style>
    </AuthMonoShell>
  );
}
