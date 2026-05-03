"use client";

import { useEffect, useState } from "react";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type Props = {
  authState: "loading" | "authenticated" | "unauthenticated";
};

export function LandingMobileMenu({ authState }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <style>{`
        .lp-hamburger {
          display: none;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          color: #0a0a0a;
          flex-shrink: 0;
        }
        .lp-mob-nav {
          position: fixed;
          top: 57px;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9;
          background: #f3f2ed;
          border-top: 1px solid rgba(10,10,10,0.07);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
          padding-bottom: 32px;
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          transform: translateY(-10px);
          transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0.22s;
        }
        .lp-mob-nav--open {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateY(0);
          transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0s;
        }
        .lp-mob-nav-item {
          display: flex;
          align-items: center;
          padding: 17px 24px;
          font-family: ${GEIST};
          font-size: 16px;
          font-weight: 500;
          color: #0a0a0a;
          text-decoration: none;
          border-bottom: 1px solid rgba(10,10,10,0.05);
        }
        .lp-mob-nav-item--cta {
          background: #0a0a0a;
          color: #fff;
          margin: 16px 24px;
          border-radius: 10px;
          justify-content: center;
          border-bottom: none;
        }
        @media (max-width: 768px) {
          .lp-hamburger { display: flex; }
        }
      `}</style>

      {/* Hamburger button */}
      <button
        type="button"
        className="lp-hamburger"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fechar menu" : "Abrir menu"}
      >
        {open ? (
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <title>Fechar menu</title>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <title>Abrir menu</title>
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Mobile nav overlay */}
      <div className={`lp-mob-nav${open ? " lp-mob-nav--open" : ""}`}>
        {/* biome-ignore lint/a11y/useValidAnchor: anchor link to page section with close-menu side effect */}
        <a
          href="#como-funciona"
          className="lp-mob-nav-item"
          onClick={() => setOpen(false)}
        >
          Como funciona
        </a>
        {/* biome-ignore lint/a11y/useValidAnchor: anchor link to page section with close-menu side effect */}
        <a
          href="#precos"
          className="lp-mob-nav-item"
          onClick={() => setOpen(false)}
        >
          Preços
        </a>
        <a
          href="/blog"
          className="lp-mob-nav-item"
          onClick={() => setOpen(false)}
        >
          Blog
        </a>
        {authState === "loading" ? (
          <div
            aria-hidden="true"
            className="lp-mob-nav-item"
            style={{ opacity: 0.5, pointerEvents: "none" }}
          >
            Carregando...
          </div>
        ) : authState === "authenticated" ? (
          <a
            href="/dashboard"
            className="lp-mob-nav-item lp-mob-nav-item--cta"
            onClick={() => setOpen(false)}
          >
            Ir para o painel →
          </a>
        ) : (
          <>
            <a
              href="/entrar?tab=entrar"
              className="lp-mob-nav-item lp-mob-nav-item--cta"
              onClick={() => setOpen(false)}
            >
              Entrar
            </a>
          </>
        )}
      </div>
    </>
  );
}
