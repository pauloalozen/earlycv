"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { PasswordInput } from "@/app/entrar/password-input";
import {
  SIGNUP_PASSWORD_RULES,
  validateSignupPassword,
} from "@/lib/password-rules";

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
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F2] px-4">
        <div className="w-full max-w-md rounded-2xl bg-white px-8 py-9 text-center shadow-sm">
          <p className="text-sm text-[#666666]">
            Link inválido.{" "}
            <a
              href="/esqueceu-senha"
              className="font-bold text-[#111111] underline underline-offset-2"
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
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F2] px-4">
      <a
        href="/"
        style={{ color: "#111111" }}
        className="mb-8 font-logo text-[2.1rem] tracking-tight"
      >
        earlyCV
      </a>

      <div className="w-full max-w-md rounded-2xl bg-white px-8 py-9 shadow-sm">
        {status === "done" ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-lime-100">
              <svg
                aria-hidden="true"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#84cc16"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-[#111111]">
              Senha redefinida!
            </h1>
            <p className="mt-2 text-sm text-[#666666]">
              Redirecionando para o login...
            </p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-1">
              <h1 className="text-xl font-bold text-[#111111]">Nova senha</h1>
              <p className="text-sm text-[#888888]">
                Use as mesmas regras de senha da criacao de conta.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}{" "}
                {status === "error" && (
                  <a href="/esqueceu-senha" className="font-bold underline">
                    Solicitar novo link
                  </a>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="reset-password"
                  className="text-xs font-semibold text-[#444444]"
                >
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
                  <ul className="mt-2 space-y-1">
                    {SIGNUP_PASSWORD_RULES.map((rule) => {
                      const ok = rule.test(password);
                      return (
                        <li
                          key={rule.label}
                          className="flex items-center gap-1.5 text-xs"
                        >
                          <span
                            className={ok ? "text-lime-600" : "text-red-400"}
                          >
                            {ok ? "✓" : "✗"}
                          </span>
                          <span
                            className={ok ? "text-lime-700" : "text-[#888888]"}
                          >
                            {rule.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="reset-password-confirm"
                  className="text-xs font-semibold text-[#444444]"
                >
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
                  <p className="text-xs text-red-500">
                    As senhas não coincidem.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                style={{ color: "#ffffff" }}
                className="w-full rounded-[14px] bg-[#111111] py-[15px] text-sm font-semibold leading-none transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:bg-[#999999]"
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
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F2] px-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#CCCCCC] border-t-[#111111]" />
        </main>
      }
    >
      <RedefinirSenhaContent />
    </Suspense>
  );
}
