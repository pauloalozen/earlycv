import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

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
    <main className="flex min-h-screen flex-col bg-[#FAFAFA] text-[#111111]">
      <header className="flex shrink-0 items-center px-10 py-6">
        <a
          href="/"
          style={{ color: "#111111" }}
          className="font-logo text-2xl tracking-tight"
        >
          earlyCV
        </a>
      </header>

      <section className="flex flex-1 items-start justify-center px-6 py-8 md:px-10">
        <div className="w-full max-w-md space-y-6">
          <div className="space-y-1 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
              {tab === "cadastro"
                ? "Crie sua conta para desbloquear sua análise"
                : "Entre na sua conta"}
            </h1>
            {tab === "cadastro" && (
              <p className="text-sm text-[#666666]">
                Grátis. Sem cartão de crédito.
              </p>
            )}
          </div>

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white p-1 shadow-sm">
            <a
              href={`/entrar?tab=cadastro${next ? `&next=${encodeURIComponent(next)}` : ""}`}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-sm font-medium transition-colors ${
                tab === "cadastro"
                  ? "bg-[#111111] text-white"
                  : "text-[#666666] hover:text-[#111111]"
              }`}
            >
              Criar conta
            </a>
            <a
              href={`/entrar?tab=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`}
              className={`flex-1 rounded-[10px] py-2.5 text-center text-sm font-medium transition-colors ${
                tab === "entrar"
                  ? "bg-[#111111] text-white"
                  : "text-[#666666] hover:text-[#111111]"
              }`}
            >
              Entrar
            </a>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Form */}
          {tab === "cadastro" ? (
            <form
              action="/auth/register-user"
              method="post"
              className="space-y-3"
            >
              {next && <input type="hidden" name="next" value={next} />}
              <input
                name="name"
                placeholder="Seu nome"
                required
                autoComplete="name"
                className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] shadow-sm outline-none"
              />
              <input
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] shadow-sm outline-none"
              />
              <input
                name="password"
                type="password"
                placeholder="Mínimo de 12 caracteres"
                required
                autoComplete="new-password"
                className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] shadow-sm outline-none"
              />
              <button
                type="submit"
                style={{ color: "#ffffff" }}
                className="w-full rounded-[14px] bg-[#111111] py-[18px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
              >
                Criar conta grátis
              </button>
            </form>
          ) : (
            <form action="/auth/login-user" method="post" className="space-y-3">
              {next && <input type="hidden" name="next" value={next} />}
              <input
                name="email"
                type="email"
                placeholder="seu@email.com"
                required
                autoComplete="email"
                className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] shadow-sm outline-none"
              />
              <input
                name="password"
                type="password"
                placeholder="Sua senha"
                required
                autoComplete="current-password"
                className="w-full rounded-xl bg-white px-4 py-3 text-sm text-[#111111] placeholder-[#BBBBBB] shadow-sm outline-none"
              />
              <button
                type="submit"
                style={{ color: "#ffffff" }}
                className="w-full rounded-[14px] bg-[#111111] py-[18px] text-base font-medium leading-none transition-colors hover:bg-[#222222]"
              >
                Entrar
              </button>
            </form>
          )}

          <p className="text-center text-xs text-[#AAAAAA]">
            {tab === "cadastro" ? (
              <>
                Já tem conta?{" "}
                <a
                  href={`/entrar?tab=entrar${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                  className="font-medium text-[#666666] underline"
                >
                  Entrar
                </a>
              </>
            ) : (
              <>
                Não tem conta?{" "}
                <a
                  href={`/entrar?tab=cadastro${next ? `&next=${encodeURIComponent(next)}` : ""}`}
                  className="font-medium text-[#666666] underline"
                >
                  Criar grátis
                </a>
              </>
            )}
          </p>
        </div>
      </section>
    </main>
  );
}
