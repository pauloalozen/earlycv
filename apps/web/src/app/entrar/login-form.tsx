"use client";

import { useState } from "react";
import { PasswordInput } from "./password-input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailValid = EMAIL_REGEX.test(email);
  const passwordValid = password.length >= 1;
  const showEmailError = touched.email && email.length > 0 && !emailValid;
  const showPasswordError = touched.password && !passwordValid;

  return (
    <form action="/auth/login-user" method="post" className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-[#444444]">Email</label>
        <input
          name="email"
          type="email"
          placeholder="seu@email.com"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, email: true }))}
          className={`w-full rounded-xl px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none transition-colors ${
            showEmailError
              ? "bg-red-50 ring-1 ring-red-300"
              : "bg-[#F5F5F5] focus:bg-[#EFEFEF]"
          }`}
        />
        {showEmailError && (
          <p className="text-xs text-red-500">Digite um email válido.</p>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-[#444444]">Senha</label>
          <a
            href="/esqueceu-senha"
            className="text-xs text-[#888888] hover:text-[#111111]"
          >
            Esqueceu sua senha?
          </a>
        </div>
        <PasswordInput
          name="password"
          placeholder="Sua senha"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        />
        {showPasswordError && (
          <p className="text-xs text-red-500">Digite sua senha.</p>
        )}
      </div>

      <button
        type="submit"
        disabled={!emailValid || !passwordValid}
        style={{ color: "#ffffff" }}
        className="mt-2 w-full rounded-[14px] bg-[#111111] py-[15px] text-sm font-semibold leading-none transition-colors hover:bg-[#222222] disabled:cursor-not-allowed"
      >
        Entrar
      </button>
    </form>
  );
}
