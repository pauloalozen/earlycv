"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

export function PublicNavBar({
  dark = false,
  hideHowItWorksLink = false,
  fixed = false,
}: {
  dark?: boolean;
  hideHowItWorksLink?: boolean;
  fixed?: boolean;
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const bg = dark ? "#0a0a0a" : "transparent";
  const borderColor = dark ? "rgba(250,250,246,0.06)" : "rgba(0,0,0,0.04)";
  const linkColor = dark ? "#a0a098" : "#3a3a38";
  const logoVariant = dark ? "dark" : "light";
  const mobileMenuBg = dark ? "#0f0f0f" : "#f3f2ed";
  const mobileMenuButtonColor = dark ? "#fafaf6" : "#0a0a0a";
  const fixedBg = dark ? "#0a0a0a" : "#f3f2ed";

  useEffect(() => {
    document.body.style.overflow = isMenuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMenuOpen]);

  return (
    <nav
      style={{
        borderBottom: fixed ? "none" : `1px solid ${borderColor}`,
        background: fixed ? fixedBg : bg,
        position: fixed ? "fixed" : "relative",
        top: fixed ? 0 : undefined,
        left: fixed ? 0 : undefined,
        right: fixed ? 0 : undefined,
        zIndex: fixed ? 20 : 2,
        fontFamily: GEIST,
      }}
      className="px-4 py-[18px] md:px-10"
    >
      <style>{`
        .public-hamburger {
          display: none;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px;
          color: ${mobileMenuButtonColor};
          flex-shrink: 0;
        }
        .public-mob-nav {
          position: fixed;
          top: 57px;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9;
          background: ${mobileMenuBg};
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
        .public-mob-nav--open {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
          transform: translateY(0);
          transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0s;
        }
        .public-mob-nav-item {
          display: flex;
          align-items: center;
          padding: 17px 24px;
          font-family: ${GEIST};
          font-size: 16px;
          font-weight: 500;
          color: ${linkColor};
          text-decoration: none;
          border-bottom: 1px solid rgba(10,10,10,0.05);
        }
        .public-mob-nav-item--cta {
          background: ${dark ? "#fafaf6" : "#0a0a0a"};
          color: ${dark ? "#0a0a0a" : "#fff"};
          margin: 16px 24px 0;
          border-radius: 10px;
          justify-content: center;
          border-bottom: none;
        }
        @media (max-width: 768px) {
          .public-hamburger { display: flex; }
        }
      `}</style>
      <div className="flex items-center justify-between">
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
          }}
        >
          <Logo variant={logoVariant} />
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: dark ? "#5a5a54" : "#8a8a85",
              border: `1px solid ${dark ? "rgba(250,250,246,0.12)" : "#d8d6ce"}`,
              borderRadius: 3,
              padding: "1px 5px",
              fontWeight: 500,
            }}
          >
            v1.2
          </span>
        </Link>

        <div className="hidden items-center gap-5 md:flex">
          <Link
            href="/vagas"
            style={{
              fontSize: 13,
              color: linkColor,
              fontWeight: 400,
              textDecoration: "none",
            }}
          >
            Vagas
          </Link>
          <Link
            href="/blog"
            style={{
              fontSize: 13,
              color: linkColor,
              fontWeight: 400,
              textDecoration: "none",
            }}
          >
            Blog
          </Link>
          {hideHowItWorksLink ? null : (
            <Link
              href="/#como-funciona"
              style={{
                fontSize: 13,
                color: linkColor,
                fontWeight: 400,
                textDecoration: "none",
              }}
            >
              Como funciona
            </Link>
          )}
          <Link
            href="/adaptar"
            style={{
              background: dark ? "#fafaf6" : "#0a0a0a",
              color: dark ? "#0a0a0a" : "#fff",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            Adaptar meu CV →
          </Link>
        </div>

        <button
          type="button"
          aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((state) => !state)}
          className="public-hamburger"
        >
          {isMenuOpen ? (
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
      </div>

      <div
        className={`public-mob-nav${isMenuOpen ? " public-mob-nav--open" : ""}`}
      >
        <Link
          href="/vagas"
          onClick={() => setIsMenuOpen(false)}
          className="public-mob-nav-item"
        >
          Vagas
        </Link>
        <Link
          href="/blog"
          onClick={() => setIsMenuOpen(false)}
          className="public-mob-nav-item"
        >
          Blog
        </Link>
        {hideHowItWorksLink ? null : (
          <Link
            href="/#como-funciona"
            onClick={() => setIsMenuOpen(false)}
            className="public-mob-nav-item"
          >
            Como funciona
          </Link>
        )}
        <Link
          href="/adaptar"
          onClick={() => setIsMenuOpen(false)}
          className="public-mob-nav-item public-mob-nav-item--cta"
        >
          Adaptar meu CV →
        </Link>
      </div>
    </nav>
  );
}
