import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { CodeInput } from "./code-input";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Verificar Email | EarlyCV",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    error?: string;
    resent?: string;
    next?: string;
  }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/verificar-email", user);
  if (redirectPath) redirect(redirectPath);

  const params = await searchParams;
  const next = params.next ?? "";

  return (
    <main className="page-transition flex min-h-screen flex-col items-center justify-center bg-[#F2F2F2] px-4 text-[#111111]">
      {/* Logo */}
      <a
        href="/"
        style={{ color: "#111111" }}
        className="mb-8 font-logo text-[2.1rem] tracking-tight"
      >
        earlyCV
      </a>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl bg-white px-10 py-9 shadow-sm">
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[#111111]">
            Verifique seu email
          </h1>
          <p className="text-sm text-[#888888]">
            Enviamos um código de 6 dígitos para{" "}
            <span className="font-semibold text-[#444444]">{user?.email}</span>
          </p>
        </div>

        {params.error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {params.error}
          </div>
        )}

        {params.resent && (
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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Confirmar código
          </button>
        </form>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#EEEEEE]" />
          <span className="text-xs text-[#BBBBBB]">ou</span>
          <div className="h-px flex-1 bg-[#EEEEEE]" />
        </div>

        <div className="mt-4 flex gap-3">
          <form action="/auth/resend-verification" method="post" className="flex-1">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white py-3 text-sm font-medium text-[#444444] transition-colors hover:bg-[#F5F5F5]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" />
                <path d="M3.51 15a9 9 0 1 0 .49-4.5" />
              </svg>
              Reenviar código
            </button>
          </form>
          <form action="/auth/logout" method="post" className="flex-1">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E8E8E8] bg-white py-3 text-sm font-medium text-[#444444] transition-colors hover:bg-[#F5F5F5]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
