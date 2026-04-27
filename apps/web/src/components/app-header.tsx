"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type Props = {
  userName?: string | null;
  logoSize?: "sm" | "md";
  backgroundColor?: string;
  variant?: "dark" | "light";
};

export function AppHeader({
  userName,
  logoSize = "md",
  backgroundColor = "transparent",
  variant = "dark",
}: Props) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const mobileBg =
    backgroundColor !== "transparent" ? backgroundColor : "#f9f8f4";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <>
      <style>{`
        .app-hdr {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 40;
        }
        .app-hdr-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 32px;
          font-family: ${GEIST};
        }
        .app-hdr-desktop { display: flex; }
        .app-hdr-burger {
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
        .app-hdr-mob-nav {
          position: fixed;
          top: 57px;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 38;
          flex-direction: column;
          overflow-y: auto;
          padding-bottom: 32px;
          display: none;
        }
        .app-hdr-mob-nav-item {
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
        .app-hdr-mob-nav-sep {
          height: 1px;
          background: rgba(10,10,10,0.08);
          margin: 8px 0;
        }
        .app-hdr-mob-nav-form { width: 100%; }
        .app-hdr-mob-nav-btn {
          display: flex;
          align-items: center;
          padding: 17px 24px;
          font-family: ${GEIST};
          font-size: 16px;
          font-weight: 500;
          color: #8a8a85;
          background: none;
          border: none;
          cursor: pointer;
          width: 100%;
          text-align: left;
        }

        @media (max-width: 768px) {
          .app-hdr { background-color: ${mobileBg} !important; }
          .app-hdr-inner { padding: 14px 20px; }
          .app-hdr-desktop { display: none !important; }
          .app-hdr-burger { display: flex; }
          .app-hdr-mob-nav {
            display: none;
            background: ${mobileBg};
            border-top: 1px solid rgba(10,10,10,0.07);
          }
          .app-hdr-mob-nav--open { display: flex !important; }
        }
      `}</style>

      <header className="app-hdr" style={{ backgroundColor }}>
        <div className="app-hdr-inner">
          {/* Logo */}
          <a
            href="/"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              textDecoration: "none",
            }}
          >
            <Logo
              variant={variant === "light" ? "dark" : "light"}
              size={logoSize === "sm" ? "sm" : "md"}
            />
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: variant === "light" ? "#555551" : "#8a8a85",
                border: `1px solid ${variant === "light" ? "#3a3a38" : "#d8d6ce"}`,
                borderRadius: 3,
                padding: "1px 5px",
                fontWeight: 500,
              }}
            >
              v1.2
            </span>
          </a>

          {/* Desktop right */}
          <div className="app-hdr-desktop">
            {userName ? (
              <div style={{ position: "relative" }} ref={ref}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "rgba(10,10,10,0.04)",
                    border: "1px solid rgba(10,10,10,0.1)",
                    borderRadius: 10,
                    padding: "6px 12px",
                    fontFamily: GEIST,
                    fontSize: 13,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "#0a0a0a",
                      color: "#c6ff3a",
                      fontSize: 10,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {userName.charAt(0).toUpperCase()}
                  </span>
                  <span
                    style={{
                      maxWidth: 120,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {userName.split(" ")[0]}
                  </span>
                  {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                  <svg
                    aria-hidden="true"
                    width="11"
                    height="11"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      flexShrink: 0,
                      transition: "transform 150ms",
                      transform: open ? "rotate(180deg)" : "rotate(0deg)",
                    }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {open && (
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      top: "calc(100% + 8px)",
                      zIndex: 50,
                      width: 176,
                      background: "#fafaf6",
                      border: "1px solid rgba(10,10,10,0.08)",
                      borderRadius: 12,
                      boxShadow: "0 8px 24px rgba(10,10,10,0.1)",
                      overflow: "hidden",
                    }}
                  >
                    {[
                      {
                        href: "/dashboard",
                        label: "Dashboard",
                        icon: (
                          <>
                            <rect x="3" y="3" width="7" height="7" />
                            <rect x="14" y="3" width="7" height="7" />
                            <rect x="3" y="14" width="7" height="7" />
                            <rect x="14" y="14" width="7" height="7" />
                          </>
                        ),
                      },
                      {
                        href: "/adaptar",
                        label: "Adaptar CV",
                        icon: (
                          <>
                            <path d="M12 20h9" />
                            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                          </>
                        ),
                      },
                      {
                        href: "/compras",
                        label: "Minhas compras",
                        icon: (
                          <>
                            <rect x="1" y="3" width="15" height="13" rx="2" />
                            <path d="M16 8h2a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <path d="M5 8h6" />
                            <path d="M5 12h6" />
                          </>
                        ),
                      },
                    ].map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 16px",
                          fontSize: 13,
                          fontFamily: GEIST,
                          color: "#0a0a0a",
                          textDecoration: "none",
                        }}
                      >
                        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                        <svg
                          aria-hidden="true"
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {item.icon}
                        </svg>
                        {item.label}
                      </a>
                    ))}
                    <a
                      href="/contato"
                      onClick={() => setOpen(false)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 16px",
                        fontSize: 13,
                        fontFamily: GEIST,
                        color: "#0a0a0a",
                        textDecoration: "none",
                      }}
                    >
                      {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                      <svg
                        aria-hidden="true"
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      Contato
                    </a>
                    <div
                      style={{
                        margin: "0 12px",
                        height: 1,
                        background: "rgba(10,10,10,0.06)",
                      }}
                    />
                    <form action="/auth/logout" method="post">
                      <button
                        type="submit"
                        style={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: 10,
                          padding: "11px 16px",
                          fontFamily: GEIST,
                          fontSize: 13,
                          color: "#0a0a0a",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        {/* biome-ignore lint/a11y/noSvgWithoutTitle: decorative */}
                        <svg
                          aria-hidden="true"
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                          <polyline points="16 17 21 12 16 7" />
                          <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sair
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <a
                href="/entrar?tab=entrar"
                style={{
                  fontFamily: GEIST,
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#0a0a0a",
                  textDecoration: "none",
                }}
              >
                Entrar
              </a>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="app-hdr-burger"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
          >
            {mobileOpen ? (
              // biome-ignore lint/a11y/noSvgWithoutTitle: decorative
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
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              // biome-ignore lint/a11y/noSvgWithoutTitle: decorative
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
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Mobile nav overlay */}
      <div
        className={`app-hdr-mob-nav${mobileOpen ? " app-hdr-mob-nav--open" : ""}`}
      >
        {userName ? (
          <>
            {[
              { href: "/dashboard", label: "Dashboard" },
              { href: "/adaptar", label: "Adaptar CV" },
              { href: "/compras", label: "Minhas compras" },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="app-hdr-mob-nav-item"
                onClick={() => setMobileOpen(false)}
              >
                {item.label}
              </a>
            ))}
            <a
              href="/contato"
              className="app-hdr-mob-nav-item"
              onClick={() => setMobileOpen(false)}
            >
              Contato
            </a>
            <div className="app-hdr-mob-nav-sep" />
            <form
              action="/auth/logout"
              method="post"
              className="app-hdr-mob-nav-form"
            >
              <button type="submit" className="app-hdr-mob-nav-btn">
                Sair
              </button>
            </form>
          </>
        ) : (
          <a
            href="/entrar?tab=entrar"
            className="app-hdr-mob-nav-item"
            onClick={() => setMobileOpen(false)}
          >
            Entrar
          </a>
        )}
      </div>

      <div aria-hidden="true" style={{ height: 65, flexShrink: 0 }} />
    </>
  );
}
