import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { buttonVariants, Card } from "@/components/ui";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  robots: {
    follow: false,
    index: false,
  },
  title: "Dashboard | EarlyCV",
};

export default async function DashboardPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/dashboard", user);

  if (redirectPath) {
    redirect(redirectPath);
  }

  return (
    <main className="min-h-screen bg-linear-to-b from-stone-50 to-orange-50/50 px-6 py-10 text-stone-900 md:px-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <Card className="space-y-4" padding="lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-orange-700">
            dashboard
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-stone-950">
            Ola, {user?.name}. Seu painel esta a caminho.
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-stone-600">
            Esta area ja esta protegida pela nova sessao do app e pronta para
            receber o dashboard do candidato nas proximas entregas.
          </p>
          <form action="/auth/logout" method="post">
            <button
              className={cn(buttonVariants({ size: "lg" }), "w-full sm:w-auto")}
              type="submit"
            >
              Sair
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}
