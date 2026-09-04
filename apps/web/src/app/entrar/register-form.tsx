"use client";

import { useEffect, useState } from "react";
import { getPendingGuestAnalysis } from "@/lib/guest-analysis-pending";
import {
  SIGNUP_PASSWORD_RULES,
  validateSignupPassword,
} from "@/lib/password-rules";
import { getOrCreateVisitorId } from "@/lib/visitor-id";
import { PasswordInput } from "./password-input";
import type { SignupConversionContext } from "./signup-conversion-context";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONO = "var(--font-geist-mono), monospace";
const JOURNEY_SESSION_KEY = "journey_session_internal_id";

export function RegisterForm({
  next,
  conversionContext,
}: {
  next: string;
  conversionContext: SignupConversionContext;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });
  const [sessionInternalId, setSessionInternalId] = useState("");
  const [visitorId, setVisitorId] = useState("");
  const [guestAnalysisJobId, setGuestAnalysisJobId] = useState("");
  const [guestPossessionToken, setGuestPossessionToken] = useState("");

  useEffect(() => {
    try {
      setSessionInternalId(sessionStorage.getItem(JOURNEY_SESSION_KEY) ?? "");
    } catch {
      // sessionStorage indisponível (privacy mode etc.) — segue sem
      // correlação de sessão, conversionContext continua enviado.
    }
    setVisitorId(getOrCreateVisitorId() ?? "");

    // Fase 5 do gate de autenticação guest: retoma o claim server-side
    // depois do cadastro, sem depender do fluxo Google.
    const pending = getPendingGuestAnalysis();
    if (pending) {
      setGuestAnalysisJobId(pending.jobId);
      setGuestPossessionToken(pending.guestPossessionToken);
    }
  }, []);

  const emailValid = EMAIL_REGEX.test(email);
  const passwordAllValid = validateSignupPassword(password);
  const showEmailError = touched.email && email.length > 0 && !emailValid;
  const showPasswordRules = touched.password && password.length > 0;

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

  const inputBase: React.CSSProperties = {
    width: "100%",
    background: "#fff",
    border: "1px solid #d8d6ce",
    borderRadius: 8,
    padding: "11px 13px",
    fontSize: 13.5,
    color: "#0a0a0a",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 150ms",
  };

  const inputError: React.CSSProperties = {
    ...inputBase,
    border: "1px solid #fca5a5",
    background: "#fff5f5",
  };

  return (
    <form
      action="/auth/register-user"
      method="post"
      style={{ display: "flex", flexDirection: "column", gap: 16 }}
    >
      {next && <input type="hidden" name="next" value={next} />}
      <input type="hidden" name="conversionContext" value={conversionContext} />
      {sessionInternalId && (
        <input
          type="hidden"
          name="sessionInternalId"
          value={sessionInternalId}
        />
      )}
      {visitorId && <input type="hidden" name="visitorId" value={visitorId} />}
      {guestAnalysisJobId && (
        <input
          type="hidden"
          name="guestAnalysisJobId"
          value={guestAnalysisJobId}
        />
      )}
      {guestPossessionToken && (
        <input
          type="hidden"
          name="guestPossessionToken"
          value={guestPossessionToken}
        />
      )}

      <div>
        <label htmlFor="register-name" style={labelStyle}>
          Nome completo
        </label>
        <input
          id="register-name"
          name="name"
          placeholder="Seu nome"
          required
          autoComplete="name"
          style={inputBase}
          className="entrar-input"
        />
      </div>

      <div>
        <label htmlFor="register-email" style={labelStyle}>
          Email
        </label>
        <input
          id="register-email"
          name="email"
          type="email"
          placeholder="seu@email.com"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          style={showEmailError ? inputError : inputBase}
          className="entrar-input"
        />
        {showEmailError && (
          <p
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#dc2626",
              marginTop: 4,
            }}
          >
            Digite um email válido.
          </p>
        )}
      </div>

      <div>
        <label htmlFor="register-password" style={labelStyle}>
          Senha
        </label>
        <PasswordInput
          id="register-password"
          name="password"
          placeholder="Crie uma senha"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        />
        {showPasswordRules && (
          <ul
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 4,
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

      <button
        type="submit"
        disabled={!emailValid || !passwordAllValid}
        style={{
          marginTop: 4,
          width: "100%",
          background: "#0a0a0a",
          color: "#fafaf6",
          border: "none",
          borderRadius: 10,
          padding: "14px",
          fontSize: 14,
          fontWeight: 500,
          cursor: "pointer",
          letterSpacing: -0.2,
          transition: "opacity 150ms",
          opacity: !emailValid || !passwordAllValid ? 0.45 : 1,
        }}
        className="entrar-submit-btn"
      >
        Criar conta
      </button>

      <style>{`
        .entrar-input:focus { border-color: #0a0a0a !important; }
        .entrar-submit-btn:not(:disabled):hover { opacity: 0.85 !important; }
      `}</style>
    </form>
  );
}
