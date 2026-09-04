import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { VerifyForm } from "./verify-form";

function sanitizeNext(next: string): string | null {
  if (!next.startsWith("/") || next.startsWith("//")) {
    return null;
  }
  return next;
}

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

export default async function VerifyEmailPage({
  searchParams,
}: VerifyEmailPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const params = await searchParams;
  const next = params.next ?? "";

  // Conta já verificada (ex.: cadastro que já chega verificado) não deve
  // perder o destino pretendido — getRouteAccessRedirectPath manda pro
  // default (/meu-perfil) sem saber do `next`, o que descartaria o claim
  // de análise guest já feito no cadastro e poluiria a navegação com um
  // hop a mais antes do resultado.
  if (user?.emailVerifiedAt) {
    redirect(sanitizeNext(next) ?? getDefaultAppRedirectPath(user));
  }

  const redirectPath = getRouteAccessRedirectPath("/verificar-email", user);
  if (redirectPath) redirect(redirectPath);

  const isResultFlow = next.startsWith("/adaptar/resultado");

  return (
    <AuthMonoShell>
      <VerifyForm
        next={next}
        isResultFlow={isResultFlow}
        error={params.error}
        resent={params.resent}
        userEmail={user?.email}
      />
    </AuthMonoShell>
  );
}
