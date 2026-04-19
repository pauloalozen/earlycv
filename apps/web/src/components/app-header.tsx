"use client";

import { useEffect, useRef, useState } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const logoFontSize = logoSize === "sm" ? 16 : 18;

  return (
    <>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 40,
          backgroundColor,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 32px",
            fontFamily: GEIST,
          }}
        >
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
            <img
              src={variant === "light" ? "/logo-white.svg" : "/logo.svg"}
              alt="earlyCV"
              style={{
                height: logoSize === "sm" ? 22 : 26,
                width: "auto",
                display: "block",
              }}
            />
            <span
              style={{
                fontFamily: MONO,
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

          {/* Right */}
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
                        color: "#8a8a85",
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
      </header>
      <div aria-hidden="true" style={{ height: 65, flexShrink: 0 }} />
    </>
  );
}
