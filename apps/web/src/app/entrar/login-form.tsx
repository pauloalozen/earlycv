"use client";

import { useState } from "react";
import { PasswordInput } from "./password-input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MONO = "var(--font-geist-mono), monospace";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailValid = EMAIL_REGEX.test(email);
  const passwordValid = password.length >= 1;
  const showEmailError = touched.email && email.length > 0 && !emailValid;
  const showPasswordError = touched.password && !passwordValid;

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
    <form action="/auth/login-user" method="post" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {next && <input type="hidden" name="next" value={next} />}

      <div>
        <label htmlFor="login-email" style={labelStyle}>Email</label>
        <input
          id="login-email"
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
          <p style={{ fontFamily: MONO, fontSize: 10.5, color: "#dc2626", marginTop: 4 }}>Digite um email válido.</p>
        )}
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <label htmlFor="login-password" style={{ ...labelStyle, marginBottom: 0 }}>Senha</label>
          <a href="/esqueceu-senha" style={{ fontFamily: MONO, fontSize: 10, color: "#8a8a85", textDecoration: "none", letterSpacing: 0.3 }}>
            Esqueceu?
          </a>
        </div>
        <PasswordInput
          id="login-password"
          name="password"
          placeholder="Sua senha"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        />
        {showPasswordError && (
          <p style={{ fontFamily: MONO, fontSize: 10.5, color: "#dc2626", marginTop: 4 }}>Digite sua senha.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!emailValid || !passwordValid}
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
          opacity: (!emailValid || !passwordValid) ? 0.45 : 1,
        }}
        className="entrar-submit-btn"
      >
        Entrar
      </button>

      <style>{`
        .entrar-input:focus { border-color: #0a0a0a !important; }
        .entrar-submit-btn:not(:disabled):hover { opacity: 0.85 !important; }
      `}</style>
    </form>
  );
}
