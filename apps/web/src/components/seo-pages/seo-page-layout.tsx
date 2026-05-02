import type { ReactNode } from "react";

import { PublicNavBar } from "@/components/public-nav-bar";

const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

export function SeoPageLayout({ children }: { children: ReactNode }) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: "var(--font-geist), -apple-system, system-ui, sans-serif",
        color: "#0a0a0a",
        position: "relative",
      }}
    >
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: GRAIN,
        }}
      />
      <PublicNavBar />
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "56px 40px 0",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </div>
    </main>
  );
}
