"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PasswordInput } from "@/app/entrar/password-input";
import { PageShell } from "@/components/page-shell";
import {
  SIGNUP_PASSWORD_RULES,
  validateSignupPassword,
} from "@/lib/password-rules";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const pageStyle: React.CSSProperties = {
  fontFamily: GEIST,
  minHeight: "100dvh",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  background:
    "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
  padding: "32px 16px",
  position: "relative",
  zIndex: 1,
};

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 400,
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 16,
  padding: "32px 28px",
  boxShadow:
    "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -16px rgba(10,10,10,0.12)",
};

const labelStyle: React.CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: "#7a7a74",
  fontWeight: 500,
  display: "block",
  marginBottom: 6,
};

function RedefinirSenhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState("");

  if (!token) {
    return (
      <main style={pageStyle}>
        <div style={{ ...cardStyle, textAlign: "center" }}>
          <p style={{ fontSize: 13.5, color: "#6a6560" }}>
            Link inválido.{" "}
            <a
              href="/esqueceu-senha"
              style={{
                color: "#0a0a0a",
                fontWeight: 500,
                textDecoration: "underline",
                textUnderlineOffset: 3,
              }}
            >
              Solicitar novo link
            </a>
          </p>
        </div>
      </main>
    );
  }

  const passwordMatch = password === confirm;
  const passwordValid = validateSignupPassword(password);
  const canSubmit = passwordValid && passwordMatch && status !== "loading";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStatus("loading");
    setError("");
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ?? "Link inválido ou expirado.",
        );
      }
      setStatus("done");
      setTimeout(() => router.push("/entrar?tab=entrar"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao redefinir senha.");
      setStatus("error");
    }
  };

  return (
    <main style={pageStyle}>
      {/* Logo */}
      <a
        href="/"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          textDecoration: "none",
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "#0a0a0a",
            boxShadow: "inset -2px -2px 0 rgba(198,255,58,0.85)",
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: "#0a0a0a",
          }}
        >
          earlyCV
        </span>
      </a>

      <div style={cardStyle}>
        {status === "done" ? (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                background: "rgba(198,255,58,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
              <svg
                aria-hidden
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#405410"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: -0.5,
                color: "#0a0a0a",
                margin: "0 0 8px",
              }}
            >
              Senha redefinida!
            </h1>
            <p style={{ fontSize: 13.5, color: "#6a6560", lineHeight: 1.5 }}>
              Redirecionando para o login...
            </p>
          </div>
        ) : (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: -0.7,
                color: "#0a0a0a",
                margin: "0 0 6px",
              }}
            >
              Nova senha
            </h1>
            <p
              style={{
                fontSize: 13.5,
                color: "#6a6560",
                lineHeight: 1.5,
                margin: "0 0 24px",
              }}
            >
              Use as mesmas regras de senha da criação de conta.
            </p>

            {error && (
              <div
                style={{
                  marginBottom: 16,
                  padding: "10px 14px",
                  background: "#fee2e2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  fontFamily: MONO,
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                {error}{" "}
                {status === "error" && (
                  <a
                    href="/esqueceu-senha"
                    style={{
                      color: "#991b1b",
                      fontWeight: 600,
                      textDecoration: "underline",
                    }}
                  >
                    Solicitar novo link
                  </a>
                )}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              style={{ display: "flex", flexDirection: "column", gap: 16 }}
            >
              <div>
                <label htmlFor="reset-password" style={labelStyle}>
                  Nova senha
                </label>
                <PasswordInput
                  id="reset-password"
                  name="password"
                  placeholder="Crie uma senha"
                  autoComplete="new-password"
                  value={password}
                  onChange={setPassword}
                />
                {password.length > 0 && (
                  <ul
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      padding: 0,
                      listStyle: "none",
                    }}
                  >
                    {SIGNUP_PASSWORD_RULES.map((rule) => {
                      const ok = rule.test(password);
                      return (
                        <li
                          key={rule.label}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontFamily: MONO,
                            fontSize: 10.5,
                          }}
                        >
                          <span style={{ color: ok ? "#4d7c0f" : "#ef4444" }}>
                            {ok ? "✓" : "✗"}
                          </span>
                          <span style={{ color: ok ? "#4d7c0f" : "#8a8a85" }}>
                            {rule.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <label htmlFor="reset-password-confirm" style={labelStyle}>
                  Confirmar senha
                </label>
                <PasswordInput
                  id="reset-password-confirm"
                  name="confirm"
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={setConfirm}
                />
                {confirm.length > 0 && !passwordMatch && (
                  <p
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#ef4444",
                      marginTop: 4,
                    }}
                  >
                    As senhas não coincidem.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                style={{
                  width: "100%",
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  border: "none",
                  borderRadius: 10,
                  padding: "14px",
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: canSubmit ? "pointer" : "default",
                  letterSpacing: -0.2,
                  opacity: canSubmit ? 1 : 0.45,
                  transition: "opacity 150ms",
                  fontFamily: GEIST,
                }}
              >
                {status === "loading" ? "Salvando..." : "Salvar nova senha"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <PageShell>
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.4,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />
      <Suspense
        fallback={
          <main
            style={{
              minHeight: "100dvh",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                border: "2px solid rgba(10,10,10,0.1)",
                borderTopColor: "#0a0a0a",
                animation: "spin 0.7s linear infinite",
              }}
            />
          </main>
        }
      >
        <RedefinirSenhaContent />
      </Suspense>
      <style>{`
        .entrar-input:focus { border-color: #0a0a0a !important; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </PageShell>
  );
}
