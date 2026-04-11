"use client";

import { useEffect, useState } from "react";
import { CodeInput } from "./code-input";

const TOTAL_SECONDS = 5 * 60;
const RESEND_DELAY = 30;

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

type Props = {
  next: string;
  isResultFlow: boolean;
  error?: string;
  resent?: string;
  userEmail?: string;
};

export function VerifyForm({
  next,
  isResultFlow,
  error,
  resent,
  userEmail,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_SECONDS);
  const [resendCountdown, setResendCountdown] = useState(RESEND_DELAY);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
      setResendCountdown((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const resendReady = resendCountdown === 0;

  const expired = secondsLeft === 0;

  return (
    <>
      {/* Último passo */}
      {isResultFlow && (
        <p className="mb-6 text-center text-sm font-semibold text-[#444444]">
          <span className="px-1.5 py-0.5">
            Último passo para ver sua análise completa
          </span>
        </p>
      )}

      <div className="mb-6 space-y-1 text-center">
        <h1 className="text-xl font-bold tracking-tight text-[#111111]">
          {isResultFlow
            ? "Confirme seu email para liberar sua análise"
            : "Verifique seu email"}
        </h1>
        <p className="text-sm text-[#888888]">
          Enviamos um código de 6 dígitos para{" "}
          <span className="font-semibold text-[#444444]">{userEmail}</span>
        </p>
      </div>

      {/* Contador */}
      <div className="mb-5 flex items-center justify-center gap-2">
        {expired ? (
          <span className="text-sm font-semibold text-red-500">
            Código expirado
          </span>
        ) : (
          <>
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#84cc16"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-sm font-semibold text-lime-600">
              Válido por{" "}
              <span className="tabular-nums">{fmt(secondsLeft)}</span>
            </span>
          </>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {resent && (
        <div className="mb-4 rounded-xl border border-lime-200 bg-lime-50 px-4 py-3 text-sm text-lime-800">
          Novo código enviado para seu email.
        </div>
      )}

      <form action="/auth/verify-email" method="post" className="space-y-6">
        {next && <input type="hidden" name="next" value={next} />}

        <CodeInput name="code" />

        <button
          type="submit"
          style={{ color: "#ffffff" }}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-[#111111] py-[15px] text-sm font-semibold leading-none transition-colors hover:bg-[#222222]"
        >
          {isResultFlow ? (
            <>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
              </svg>
              Liberar análise completa
            </>
          ) : (
            <>
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Confirmar código
            </>
          )}
        </button>
      </form>

      <div className="mt-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-[#EEEEEE]" />
        <span className="text-xs text-[#BBBBBB]">ou</span>
        <div className="h-px flex-1 bg-[#EEEEEE]" />
      </div>

      <form action="/auth/resend-verification" method="post" className="mt-4">
        <button
          type="submit"
          disabled={!resendReady}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white py-3 text-sm font-medium transition-colors hover:bg-[#F5F5F5] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: resendReady ? "#444444" : "#AAAAAA" }}
        >
          <svg
            aria-hidden="true"
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
          </svg>
          {resendReady
            ? "Não recebeu? Reenviar o código"
            : `Não recebeu? Reenviar em ${resendCountdown}s`}
        </button>
      </form>
    </>
  );
}
