import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { PageShell } from "@/components/page-shell";
import { RegisterForm } from "./register-form";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Criar conta | EarlyCV",
};

type EntrarPageProps = {
  searchParams: Promise<{
    tab?: string;
    error?: string;
    next?: string;
  }>;
};

export default async function EntrarPage({ searchParams }: EntrarPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/entrar", user);
  if (redirectPath) redirect(redirectPath);

  const params = await searchParams;
  const tab = params.tab === "entrar" ? "entrar" : "cadastro";
  const error = params.error ?? "";
  const next = params.next ?? "";

  return (
    <PageShell>
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#F2F2F2] px-4 text-[#111111]">
      {/* Logo */}
      <a
        href="/"
        style={{ color: "#111111" }}
        className="mb-8 font-logo text-[2.1rem] tracking-tight"
      >
        earlyCV
      </a>

      <div className="mb-6 flex items-center gap-2 rounded-full border border-[#111111] bg-[#111111] px-4 py-1.5 text-sm font-medium text-white">
        <span className="text-lime-400">●</span>
        +3.500 CVs analisados
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl bg-white px-10 py-9 shadow-sm">
        {/* Título */}
        <div className="mb-6 space-y-1 text-center">
          <h1 className="text-xl font-bold tracking-tight text-[#111111]">
            {tab === "cadastro" ? "Crie sua conta" : "Bem-vindo de volta"}
          </h1>
          <p className="text-sm text-[#888888]">
            {tab === "cadastro"
              ? "Grátis. Sem cartão. Menos de 1 minuto."
              : "Entre para acessar sua conta"}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Form */}
        {tab === "cadastro" ? (
          <RegisterForm next={next} />
        ) : (
          <LoginForm next={next} />
        )}

        {/* Divider */}
        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#EEEEEE]" />
          <span className="text-xs text-[#BBBBBB]">ou continue com</span>
          <div className="h-px flex-1 bg-[#EEEEEE]" />
        </div>

        {/* Social */}
        <a
          href={`${process.env.NEXT_PUBLIC_API_URL}/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="mt-4 flex w-full items-center justify-center gap-3 rounded-xl border border-[#E8E8E8] bg-white py-3 text-sm font-medium text-[#333333] transition-colors hover:bg-[#F5F5F5]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Continuar com Google
        </a>

        {/* Link de troca */}
        <p className="mt-5 text-center text-sm text-[#888888]">
          {tab === "cadastro" ? (
            <>
              Já tem conta?{" "}
              <a
                href={`/entrar?tab=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                className="font-bold text-[#111111] underline underline-offset-2 hover:text-[#333333]"
              >
                Entrar
              </a>
            </>
          ) : (
            <>
              Não tem conta?{" "}
              <a
                href={`/entrar?tab=cadastro${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                className="font-bold text-[#111111] underline underline-offset-2 hover:text-[#333333]"
              >
                Criar grátis
              </a>
            </>
          )}
        </p>
      </div>
    </main>
    </PageShell>
  );
}
