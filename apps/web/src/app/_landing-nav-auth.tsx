"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { LandingMobileMenu } from "./_landing-mobile-menu";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

const LINK_STYLE = {
  fontSize: 13,
  color: "#3a3a38",
  fontWeight: 450,
  letterSpacing: -0.1,
  textDecoration: "none",
} as const;

const BTN_PRIMARY = {
  background: "#0a0a0a",
  color: "#fff",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 12.5,
  fontWeight: 500,
  letterSpacing: -0.1,
  textDecoration: "none",
  fontFamily: GEIST,
  boxShadow: "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
} as const;

export function LandingNavAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => setIsLoggedIn(Boolean(data?.authenticated)))
      .catch(() => {});
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
        {isLoggedIn ? (
          <Link
            href="/dashboard"
            style={{
              ...BTN_PRIMARY,
              display: "inline-flex",
              alignItems: "center",
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
          <>
            <Link
              href="/entrar?tab=entrar"
              style={{
                fontSize: 13,
                fontWeight: 500,
                color: "#0a0a0a",
                textDecoration: "none",
                padding: "8px 4px",
              }}
            >
              Entrar
            </Link>
            <Link
              href="/entrar?tab=cadastrar"
              style={{
                ...BTN_PRIMARY,
                display: "inline-flex",
                alignItems: "center",
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
                  <title>Seta</title>
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </span>
              Começar grátis →
            </Link>
          </>
        )}
      </div>

      {/* Mobile hamburger */}
      <LandingMobileMenu isLoggedIn={isLoggedIn} />
    </>
  );
}
