import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { BrandMark, buttonVariants, Card, Input } from "@/components/ui";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Entrar | EarlyCV",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    next?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/login", user);

  if (redirectPath) {
    redirect(redirectPath);
  }

  const params = await searchParams;
  const error = params.error;
  const next = params.next;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(234,88,12,0.16),_transparent_32%),linear-gradient(180deg,_#fffaf5_0%,_#f5f5f4_100%)] px-6 py-10 text-stone-900 md:px-10 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl flex-col justify-center gap-8 lg:grid lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-3 rounded-full border border-orange-200 bg-white/80 px-4 py-2 text-sm font-medium text-stone-600 backdrop-blur">
            <BrandMark className="size-8 rounded-xl" />
            EarlyCV
          </div>
          <div className="space-y-4">
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-orange-700">
              acesso seguro
            </p>
            <h1 className="max-w-xl text-4xl font-bold tracking-tight text-stone-950 md:text-5xl">
              Entre, valide seu email e siga para o painel certo.
            </h1>
            <p className="max-w-xl text-base leading-7 text-stone-600 md:text-lg">
              A mesma porta atende candidatos, operadores admin e superadmins,
              sempre com sessao protegida e validacao de email por codigo.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-stone-600 sm:grid-cols-3">
            {[
              "Sessao via cookies HTTP-only",
              "Codigo de validacao por email",
              "Destino automatico por perfil",
            ].map((item) => (
              <div
                className="rounded-2xl border border-stone-200 bg-white/80 px-4 py-4 shadow-sm"
                key={item}
              >
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card className="space-y-5" padding="lg">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-orange-700">
                entrar
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-stone-950">
                Acessar conta
              </h2>
              <p className="text-sm leading-6 text-stone-600">
                Use seu email e senha para seguir para o dashboard ou admin.
              </p>
            </div>

            <form action="/auth/login" className="space-y-3" method="post">
              {next && <input type="hidden" name="next" value={next} />}
              <Input
                autoComplete="email"
                inputMode="email"
                name="email"
                pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                placeholder="voce@empresa.com"
                required
                title="Informe um email valido, como nome@empresa.com"
                type="email"
              />
              <Input
                name="password"
                placeholder="Sua senha"
                required
                type="password"
              />
              <button
                className={cn(buttonVariants({ size: "lg" }), "w-full")}
                type="submit"
              >
                Entrar
              </button>
            </form>
          </Card>

          <Card
            className="space-y-5 border-orange-200 bg-white/90"
            padding="lg"
          >
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-teal-700">
                criar conta
              </p>
              <h2 className="text-2xl font-bold tracking-tight text-stone-950">
                Comecar agora
              </h2>
              <p className="text-sm leading-6 text-stone-600">
                Criamos sua conta, enviamos um codigo e liberamos o acesso logo
                apos a validacao.
              </p>
            </div>

            <form action="/auth/register" className="space-y-3" method="post">
              <Input name="name" placeholder="Seu nome" required />
              <Input
                autoComplete="email"
                inputMode="email"
                name="email"
                pattern="^[^\s@]+@[^\s@]+\.[^\s@]+$"
                placeholder="voce@empresa.com"
                required
                title="Informe um email valido, como nome@empresa.com"
                type="email"
              />
              <Input
                name="password"
                placeholder="Minimo de 12 caracteres"
                required
                type="password"
              />
              <button
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "w-full border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100",
                )}
                type="submit"
              >
                Criar conta
              </button>
            </form>
          </Card>

          {error ? (
            <Card
              className="border-rose-200 bg-rose-50 text-rose-900 xl:col-span-2"
              padding="sm"
            >
              <p className="text-sm font-medium">{error}</p>
            </Card>
          ) : null}
        </section>
      </div>
    </main>
  );
}
