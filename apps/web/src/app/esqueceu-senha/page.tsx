"use client";

import { useState } from "react";
export default function EsqueceuSenhaPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle",
  );
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
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar o email. Tente novamente.",
      );
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
            <h1 className="text-xl font-bold text-[#111111]">Email enviado</h1>
            <p className="mt-2 text-sm text-[#666666]">
              Se existe uma conta com <strong>{email}</strong>, você receberá um
              link para redefinir sua senha em instantes.
            </p>
            <a
              href="/entrar?tab=entrar"
              className="mt-6 block text-sm font-semibold text-[#111111] underline underline-offset-2"
            >
              Voltar para o login
            </a>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-1">
              <h1 className="text-xl font-bold text-[#111111]">
                Esqueceu sua senha?
              </h1>
              <p className="text-sm text-[#888888]">
                Informe seu email e enviaremos um link para criar uma nova
                senha.
              </p>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label
                  htmlFor="forgot-password-email"
                  className="text-xs font-semibold text-[#444444]"
                >
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
                  className="w-full rounded-xl bg-[#F5F5F5] px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] outline-none focus:bg-[#EFEFEF]"
                />
              </div>

              <button
                type="submit"
                disabled={status === "loading" || !email.trim()}
                style={{ color: "#ffffff" }}
                className="w-full rounded-[14px] bg-[#111111] py-[15px] text-sm font-semibold leading-none transition-colors hover:bg-[#222222] disabled:cursor-not-allowed disabled:bg-[#999999]"
              >
                {status === "loading"
                  ? "Enviando..."
                  : "Enviar link de redefinição"}
              </button>
            </form>

            <p className="mt-5 text-center text-sm text-[#888888]">
              Lembrou a senha?{" "}
              <a
                href="/entrar?tab=entrar"
                className="font-bold text-[#111111] underline underline-offset-2"
              >
                Entrar
              </a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
