import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/page-shell";
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

        {/* Card */}
        <div className="w-full max-w-lg rounded-2xl bg-white px-10 py-9 shadow-sm">
          <VerifyForm
            next={next}
            isResultFlow={isResultFlow}
            error={params.error}
            resent={params.resent}
            userEmail={user?.email}
          />
        </div>
      </main>
    </PageShell>
  );
}
