import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { buttonVariants, Card, Input } from "@/components/ui";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Verificar Email | EarlyCV",
};

type VerifyEmailPageProps = {
  searchParams: Promise<{
    error?: string;
    resent?: string;
  }>;
};

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/verificar-email", user);

  if (redirectPath) {
    redirect(redirectPath);
  }

  const params = await searchParams;

  return (
    <main className="min-h-screen bg-stone-100 px-6 py-10 text-stone-900 md:px-10">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <Card className="w-full space-y-6" padding="lg">
          <div className="space-y-3">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-orange-700">
              verificar email
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-stone-950">
              Digite o codigo enviado para {user?.email}.
            </h1>
            <p className="text-sm leading-6 text-stone-600">
              Enquanto o email nao estiver validado, o acesso ao produto fica
              temporariamente bloqueado.
            </p>
          </div>

          {params.error ? (
            <Card
              className="border-rose-200 bg-rose-50 text-rose-900"
              padding="sm"
            >
              <p className="text-sm font-medium">{params.error}</p>
            </Card>
          ) : null}

          {params.resent ? (
            <Card
              className="border-teal-200 bg-teal-50 text-teal-900"
              padding="sm"
            >
              <p className="text-sm font-medium">
                Enviamos um novo codigo para seu email.
              </p>
            </Card>
          ) : null}

          <form action="/auth/verify-email" className="space-y-3" method="post">
            <Input
              inputMode="numeric"
              maxLength={6}
              name="code"
              pattern="[0-9]{6}"
              placeholder="000000"
              required
            />
            <button
              className={cn(buttonVariants({ size: "lg" }), "w-full")}
              type="submit"
            >
              Validar codigo
            </button>
          </form>

          <div className="flex flex-col gap-3 sm:flex-row">
            <form
              action="/auth/resend-verification"
              className="flex-1"
              method="post"
            >
              <button
                className={cn(
                  buttonVariants({ size: "lg", variant: "outline" }),
                  "w-full",
                )}
                type="submit"
              >
                Reenviar codigo
              </button>
            </form>
            <form action="/auth/logout" className="flex-1" method="post">
              <button
                className={cn(
                  buttonVariants({ size: "lg", variant: "ghost" }),
                  "w-full",
                )}
                type="submit"
              >
                Sair
              </button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}
