import type { ReactNode } from "react";
import { Logo } from "@/components/logo";
import { PageShell } from "@/components/page-shell";

type AuthMonoShellProps = {
  children: ReactNode;
  cardMaxWidth?: number;
};

export function AuthMonoShell({
  children,
  cardMaxWidth = 460,
}: AuthMonoShellProps) {
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
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>\")",
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
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            marginBottom: 40,
          }}
        >
          <Logo size="lg" />
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              color: "#8a8a85",
              border: "1px solid #d8d6ce",
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 500,
            }}
          >
            v1.2
          </span>
        </a>

        <div
          style={{
            width: "100%",
            maxWidth: cardMaxWidth,
            background: "#fafaf6",
            border: "1px solid rgba(10,10,10,0.08)",
            borderRadius: 18,
            padding: "36px 32px",
            boxShadow: "0 8px 40px -12px rgba(10,10,10,0.12)",
            position: "relative",
            zIndex: 1,
          }}
        >
          {children}
        </div>
      </main>
    </PageShell>
  );
}
