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
      <div
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.45,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
        aria-hidden
      />
      <main
        style={{
          fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 20px",
          color: "#0a0a0a",
          position: "relative",
        }}
      >
        {/* Logo */}
        <a
          href="/"
          style={{
            fontFamily: "var(--font-instrument-serif), serif",
            fontSize: "2rem",
            letterSpacing: "-0.05em",
            color: "#0a0a0a",
            textDecoration: "none",
            marginBottom: 40,
            display: "block",
          }}
        >
          earlyCV
        </a>

        {/* Card */}
        <div
          style={{
            width: "100%",
            maxWidth: 460,
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 18,
            padding: "36px 32px",
            boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
            position: "relative",
            zIndex: 1,
          }}
        >
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
