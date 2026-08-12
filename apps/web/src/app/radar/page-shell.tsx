import type { ReactNode } from "react";

import { PublicFooter } from "@/components/public-footer";
import { PublicNavBar } from "@/components/public-nav-bar";
import type { AppInternalRole } from "@/lib/app-session";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const GRAIN = `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

// Wrapper visual compartilhado por /radar e pelas landing pages de SEO
// (/radar/area/[area], /radar/remotas, /radar/junior, /radar/senior,
// /radar/empresa/[empresa], /radar/tecnologia/[tech]) — grain, navbar,
// largura de conteúdo e footer idênticos em todas. `extraHead` é pra
// JSON-LD específico de cada página (ItemList já vem de dentro de
// RadarJobsListing; WebSite/SearchAction do /radar, etc.).
export function RadarPageShell({
  children,
  extraHead,
  userName,
  userRole,
  credits,
}: {
  children: ReactNode;
  extraHead?: ReactNode;
  userName?: string | null;
  userRole?: AppInternalRole | null;
  credits?: number | "∞" | "—";
}) {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        fontFamily: GEIST,
        color: "#0a0a0a",
        position: "relative",
      }}
    >
      {extraHead}

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

      <PublicNavBar
        hideHowItWorksLink
        hideJobsLink
        fixed
        userName={userName}
        userRole={userRole}
        credits={credits}
      />

      <div
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "120px clamp(16px,4vw,48px) 80px",
          position: "relative",
          zIndex: 1,
        }}
      >
        {children}
      </div>

      <PublicFooter />
    </main>
  );
}
