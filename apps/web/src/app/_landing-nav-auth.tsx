"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LandingMobileMenu } from "./_landing-mobile-menu";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

const LINK_STYLE = {
  fontSize: 13,
  color: "#3a3a38",
  fontWeight: 400,
  letterSpacing: -0.1,
  textDecoration: "none",
} as const;

const BTN_PRIMARY = {
  background: "#0a0a0a",
  color: "#fff",
  borderRadius: 8,
  height: 34,
  padding: "0 14px",
  lineHeight: "34px",
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: -0.1,
  textDecoration: "none",
  fontFamily: GEIST,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
} as const;

const AUTH_CTA_WIDTH = 176;

export function LandingNavAuth() {
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => {
        setAuthState(data?.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        setAuthState("unauthenticated");
      });
  }, []);

  return (
    <>
      {/* Desktop nav links — hidden on mobile via CSS class */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 24 }}
        className="lp-nav-links"
      >
        <a href="#como-funciona" style={LINK_STYLE}>
          Como funciona
        </a>
        <a href="#precos" style={LINK_STYLE}>
          Preços
        </a>
        <Link href="/blog" style={LINK_STYLE}>
          Blog
        </Link>
        {authState === "loading" ? (
          <div
            data-testid="landing-auth-placeholder"
            aria-hidden="true"
            style={{
              width: AUTH_CTA_WIDTH,
              height: 34,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              borderRadius: 8,
              background: "rgba(10,10,10,0.08)",
              animation: "lp-auth-pulse 1.2s ease-in-out infinite",
            }}
          />
        ) : authState === "authenticated" ? (
          <Link
            href="/dashboard"
            style={{
              ...BTN_PRIMARY,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              width: AUTH_CTA_WIDTH,
              gap: 6,
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Dashboard</title>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="4" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="14" width="7" height="7" />
              </svg>
            </span>
            Ir para o painel →
          </Link>
        ) : (
          <Link
            href="/entrar?tab=entrar"
            style={{
              ...BTN_PRIMARY,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              width: AUTH_CTA_WIDTH,
              gap: 6,
            }}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Login</title>
                <path d="M14 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <path d="M10 17l5-5-5-5" />
                <path d="M15 12H3" />
              </svg>
            </span>
            Entrar
          </Link>
        )}
      </div>

      <style>{`
        @keyframes lp-auth-pulse {
          0% { opacity: 0.45; }
          50% { opacity: 0.8; }
          100% { opacity: 0.45; }
        }
      `}</style>

      {/* Mobile hamburger */}
      <LandingMobileMenu authState={authState} />
    </>
  );
}
