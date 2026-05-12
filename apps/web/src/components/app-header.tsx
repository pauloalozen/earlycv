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
  availableCredits?: number | "∞" | "—";
};

const CREDIT_REDEEMED_EVENT = "dashboard:credit-redeemed";

export function AppHeader({
  userName,
  logoSize = "md",
  backgroundColor = "rgba(243,242,237,0.95)",
  variant = "dark",
  availableCredits,
}: Props) {
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuCredits, setMenuCredits] = useState<
    number | "∞" | "—" | undefined
  >(availableCredits);
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

  useEffect(() => {
    setMenuCredits(availableCredits);
  }, [availableCredits]);

  useEffect(() => {
    const onCreditRedeemed = () => {
      setMenuCredits((current) => {
        if (typeof current !== "number") return current;
        return Math.max(0, current - 1);
      });
    };

    window.addEventListener(CREDIT_REDEEMED_EVENT, onCreditRedeemed);
    return () =>
      window.removeEventListener(CREDIT_REDEEMED_EVENT, onCreditRedeemed);
  }, []);

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
        .app-hdr-trigger {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #fff;
          border: 1px solid rgba(10,10,10,0.1);
          border-radius: 999px;
          padding: 5px 12px 5px 5px;
          font-size: 13.5px;
          font-weight: 500;
          color: #0a0a0a;
          cursor: pointer;
          transition: background-color 120ms ease, border-color 120ms ease;
        }
        .app-hdr-trigger:hover,
        .app-hdr-trigger--open {
          background: #f5f4ee;
          border-color: rgba(10,10,10,0.16);
        }
        .app-hdr-chevron {
          color: #8a8a85;
          transition: transform 200ms cubic-bezier(.3,.9,.4,1);
        }
        .app-hdr-chevron--open {
          transform: rotate(180deg);
        }
        .app-hdr-dropdown {
          opacity: 0;
          transform: translateY(-6px) scale(0.98);
          pointer-events: none;
          transition: opacity 160ms cubic-bezier(.3,.9,.4,1), transform 160ms cubic-bezier(.3,.9,.4,1);
          transform-origin: top right;
        }
        .app-hdr-dropdown--open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        .app-hdr-dd-item {
          transition: background-color 120ms ease;
          border-radius: 8px;
        }
        .app-hdr-dd-item:hover {
          background: rgba(10,10,10,0.05);
        }
        .app-hdr-dd-item--active {
          font-weight: 500;
        }
        .app-hdr-dd-item--destructive {
          color: #c0392b !important;
        }
        .app-hdr-dd-item--destructive:hover {
          background: rgba(192,57,43,0.12) !important;
        }
        .app-hdr-dd-icon {
          color: #6a6560;
          flex-shrink: 0;
        }
        .app-hdr-dd-item--active .app-hdr-dd-icon {
          color: #0a0a0a;
        }
        .app-hdr-dd-item--destructive .app-hdr-dd-icon {
          color: #c0392b;
        }
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
          gap: 10px;
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
        .app-hdr-mob-nav-section-title {
          padding: 10px 24px 6px;
          font-family: ${MONO};
          font-size: 10px;
          letter-spacing: 1.1px;
          text-transform: uppercase;
          color: #8a8a85;
          font-weight: 500;
        }
        .app-hdr-mob-nav-form { width: 100%; }
        .app-hdr-mob-nav-btn {
          display: flex;
          align-items: center;
          gap: 10px;
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
            display: flex;
            background: ${mobileBg};
            border-top: 1px solid rgba(10,10,10,0.07);
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-10px);
            transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0.22s;
          }
          .app-hdr-mob-nav--open {
            opacity: 1;
            visibility: visible;
            pointer-events: auto;
            transform: translateY(0);
            transition: opacity 0.22s ease, transform 0.22s ease, visibility 0s linear 0s;
          }
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
                  className={`app-hdr-trigger${open ? " app-hdr-trigger--open" : ""}`}
                  style={{
                    fontFamily: GEIST,
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
                      color: "#fafaf6",
                      fontSize: 10,
                      fontWeight: 600,
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
                    className={`app-hdr-chevron${open ? " app-hdr-chevron--open" : ""}`}
                    style={{ flexShrink: 0 }}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                <div
                  className={`app-hdr-dropdown${open ? " app-hdr-dropdown--open" : ""}`}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    zIndex: 50,
                    width: 232,
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 14,
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -10px rgba(10,10,10,0.14)",
                    padding: 6,
                  }}
                >
                  {menuCredits !== undefined ? (
                    <div
                      style={{
                        marginBottom: 4,
                        padding: "10px 12px",
                        borderRadius: 9,
                        background: "rgba(10,10,10,0.03)",
                        border: "1px solid rgba(10,10,10,0.06)",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 6px",
                          fontFamily: MONO,
                          fontSize: 9.5,
                          letterSpacing: 1.1,
                          color: "#8a8a85",
                          fontWeight: 500,
                        }}
                      >
                        CRÉDITOS DISPONÍVEIS:
                      </p>
                      <p
                        style={{
                          margin: "0 0 8px",
                          fontFamily: GEIST,
                          fontSize: 30,
                          fontWeight: 600,
                          letterSpacing: -1.2,
                          color: "#0a0a0a",
                          lineHeight: 1,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {menuCredits}
                      </p>
                      <a
                        href="/planos"
                        onClick={() => setOpen(false)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          marginTop: 8,
                          borderRadius: 5,
                          padding: "3px 8px",
                          fontSize: 11,
                          fontWeight: 500,
                          color: "#0a0a0a",
                          background: "#c6ff3a",
                          textDecoration: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        + Comprar créditos
                      </a>
                    </div>
                  ) : null}
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
                    {
                      href: "/blog",
                      label: "Blog",
                      icon: (
                        <>
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
                        </>
                      ),
                    },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`app-hdr-dd-item${item.href === "/dashboard" ? " app-hdr-dd-item--active" : ""}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px",
                        fontSize: 13.5,
                        fontFamily: GEIST,
                        color: "#1a1a1a",
                        textDecoration: "none",
                      }}
                    >
                      <svg
                        className="app-hdr-dd-icon"
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
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
                    className="app-hdr-dd-item"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px",
                      fontSize: 13.5,
                      fontFamily: GEIST,
                      color: "#1a1a1a",
                      textDecoration: "none",
                    }}
                  >
                    <svg
                      className="app-hdr-dd-icon"
                      aria-hidden="true"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
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
                  <p
                    style={{
                      margin: "8px 8px 4px",
                      fontFamily: MONO,
                      fontSize: 9,
                      letterSpacing: 1.2,
                      textTransform: "uppercase",
                      color: "#8a8a85",
                      fontWeight: 500,
                    }}
                  >
                    APRENDER
                  </p>
                  {[
                    {
                      href: "/palavras-chave-curriculo",
                      label: "Palavras-chave",
                      icon: (
                        <>
                          <circle cx="11" cy="11" r="7" />
                          <path d="m21 21-4.3-4.3" />
                        </>
                      ),
                    },
                    {
                      href: "/adaptar-curriculo-para-vaga",
                      label: "Como adaptar um CV",
                      icon: (
                        <>
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </>
                      ),
                    },
                    {
                      href: "/curriculo-ats",
                      label: "Currículo ATS",
                      icon: (
                        <>
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <path d="M8 13h8" />
                          <path d="M8 17h8" />
                        </>
                      ),
                    },
                  ].map((item) => (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="app-hdr-dd-item"
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px",
                        fontSize: 13.5,
                        fontFamily: GEIST,
                        color: "#1a1a1a",
                        textDecoration: "none",
                      }}
                    >
                      <svg
                        className="app-hdr-dd-icon"
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        {item.icon}
                      </svg>
                      {item.label}
                    </a>
                  ))}
                  <div
                    style={{
                      margin: "4px 0",
                      height: 1,
                      background: "rgba(10,10,10,0.06)",
                    }}
                  />
                  <form action="/auth/logout" method="post">
                    <button
                      type="submit"
                      className="app-hdr-dd-item app-hdr-dd-item--destructive"
                      style={{
                        display: "flex",
                        width: "100%",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px",
                        fontFamily: GEIST,
                        fontSize: 13.5,
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <svg
                        className="app-hdr-dd-icon"
                        aria-hidden="true"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
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
              {
                href: "/blog",
                label: "Blog",
                icon: (
                  <>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5V4.5A2.5 2.5 0 0 1 6.5 2z" />
                  </>
                ),
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="app-hdr-mob-nav-item"
                onClick={() => setMobileOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
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
              className="app-hdr-mob-nav-item"
              onClick={() => setMobileOpen(false)}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
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
            <div className="app-hdr-mob-nav-sep" />
            <p className="app-hdr-mob-nav-section-title">Aprender</p>
            {[
              {
                href: "/palavras-chave-curriculo",
                label: "Palavras-chave",
                icon: (
                  <>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </>
                ),
              },
              {
                href: "/adaptar-curriculo-para-vaga",
                label: "Como adaptar um CV",
                icon: (
                  <>
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </>
                ),
              },
              {
                href: "/curriculo-ats",
                label: "Curriculo ATS",
                icon: (
                  <>
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <path d="M8 13h8" />
                    <path d="M8 17h8" />
                  </>
                ),
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="app-hdr-mob-nav-item"
                onClick={() => setMobileOpen(false)}
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
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
            <div className="app-hdr-mob-nav-sep" />
            <form
              action="/auth/logout"
              method="post"
              className="app-hdr-mob-nav-form"
            >
              <button type="submit" className="app-hdr-mob-nav-btn">
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
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
