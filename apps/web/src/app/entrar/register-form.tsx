"use client";

import { useState } from "react";
import {
  SIGNUP_PASSWORD_RULES,
  validateSignupPassword,
} from "@/lib/password-rules";
import { PasswordInput } from "./password-input";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState({ email: false, password: false });

  const emailValid = EMAIL_REGEX.test(email);
  const passwordAllValid = validateSignupPassword(password);
  const showEmailError = touched.email && email.length > 0 && !emailValid;
  const showPasswordRules = touched.password && password.length > 0;

  return (
    <form action="/auth/register-user" method="post" className="space-y-4">
      {next && <input type="hidden" name="next" value={next} />}

      <div className="space-y-1">
        <label className="text-xs font-semibold text-[#444444]">
          Nome completo
        </label>
        <input
          name="name"
          placeholder="Seu nome"
          required
          autoComplete="name"
          className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none transition-colors focus:bg-[#EFEFEF]"
        />
      </div>

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
        <label className="text-xs font-semibold text-[#444444]">Senha</label>
        <PasswordInput
          name="password"
          placeholder="Crie uma senha"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
        />
        {showPasswordRules && (
          <ul className="mt-2 space-y-1">
            {SIGNUP_PASSWORD_RULES.map((rule) => {
              const ok = rule.test(password);
              return (
                <li
                  key={rule.label}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <span className={ok ? "text-lime-600" : "text-red-400"}>
                    {ok ? "✓" : "✗"}
                  </span>
                  <span className={ok ? "text-lime-700" : "text-[#888888]"}>
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
        style={{ color: "#ffffff" }}
        className="mt-2 w-full rounded-[14px] bg-[#111111] py-[15px] text-sm font-semibold leading-none transition-colors hover:bg-[#222222] disabled:cursor-not-allowed"
      >
        Criar conta.
      </button>
    </form>
  );
}
