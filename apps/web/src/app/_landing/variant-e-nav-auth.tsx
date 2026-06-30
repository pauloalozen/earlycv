"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LandingMobileMenu } from "../_landing-mobile-menu";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export function VariantENavAuth() {
  const [authState, setAuthState] = useState<
    "loading" | "authenticated" | "unauthenticated"
  >("loading");

  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : { authenticated: false }))
      .then((data) => {
        setAuthState(data?.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => setAuthState("unauthenticated"));
  }, []);

  return (
    <>
      <div
        style={{ display: "flex", alignItems: "center", gap: 10 }}
        className="e-nav-auth-desktop"
      >
        {authState === "loading" ? (
          <div
            style={{
              width: 180,
              height: 34,
              borderRadius: 8,
              background: "rgba(10,10,10,0.08)",
              animation: "eNavAuthPulse 1.2s ease-in-out infinite",
            }}
          />
        ) : authState === "authenticated" ? (
          <Link
            href="/meu-perfil"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13.5,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: GEIST,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Ir para o painel →
          </Link>
        ) : (
          <>
            <Link
              href="/entrar?tab=entrar"
              style={{
                fontSize: 13.5,
                color: "#3a3a38",
                fontWeight: 450,
                textDecoration: "none",
                letterSpacing: -0.1,
              }}
            >
              Entrar
            </Link>
            <Link
              href="/adaptar"
              style={{
                background: "#0a0a0a",
                color: "#fff",
                borderRadius: 8,
                padding: "8px 18px",
                fontSize: 13.5,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: GEIST,
                letterSpacing: -0.1,
                boxShadow:
                  "0 1px 2px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.08)",
              }}
            >
              Começar grátis →
            </Link>
          </>
        )}
      </div>

      <LandingMobileMenu authState={authState} />

      <style>{`
        @keyframes eNavAuthPulse {
          0% { opacity: 0.45; }
          50% { opacity: 0.8; }
          100% { opacity: 0.45; }
        }
        @media (max-width: 768px) {
          .e-nav-auth-desktop { display: none !important; }
        }
      `}</style>
    </>
  );
}
