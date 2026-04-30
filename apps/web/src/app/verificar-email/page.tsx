import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthMonoShell } from "@/components/auth/auth-mono-shell";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { VerifyForm } from "./verify-form";

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
  const redirectPath = getRouteAccessRedirectPath("/verificar-email", user);
  if (redirectPath) redirect(redirectPath);

  const params = await searchParams;
  const next = params.next ?? "";
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
