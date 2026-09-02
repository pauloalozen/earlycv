"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { AppInternalRole } from "@/lib/app-session";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { MonitorNavBadge } from "./monitor-nav-badge";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

export type UserMenuItem = {
  href: string;
  label: string;
  icon: ReactNode;
};

export function buildUserMenuItems({
  userRole,
}: {
  userRole?: AppInternalRole | null;
}): UserMenuItem[] {
  const canAccessAdmin = userRole === "admin" || userRole === "superadmin";
  const canAccessSuperadmin = userRole === "superadmin";
  const canSeeJobsLink =
    !isJobsGhostModeEnabled() || canAccessJobsInGhostMode(userRole);

  return [
    {
      href: "/meu-perfil",
      label: "Meu Perfil",
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
      href: "/candidaturas",
      label: "Candidaturas",
      icon: (
        <>
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
          <path d="M9 12h6" />
          <path d="M9 16h6" />
        </>
      ),
    },
    {
      href: "/analises",
      label: "Análises",
      icon: (
        <>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </>
      ),
    },
    {
      href: "/radar",
      label: "Radar de Oportunidades",
      icon: (
        <>
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </>
      ),
    },
    // Ícone deliberadamente diferente do Radar (retângulos/prateleira) —
    // alvo/pulso reforça "algo trabalhando por você", não "explorar uma
    // lista" (ver distinção de produto Radar x Monitor).
    {
      href: "/alerta-vaga-certa",
      label: "Alerta de Vaga Certa",
      icon: (
        <>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
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
    ...(canAccessAdmin
      ? [
          {
            href: "/admin",
            label: "Admin",
            icon: (
              <>
                <rect x="4" y="3" width="16" height="18" rx="2" />
                <path d="M9 8h6" />
                <path d="M9 12h6" />
              </>
            ),
          },
        ]
      : []),
    ...(canAccessSuperadmin
      ? [
          {
            href: "/superadmin",
            label: "Superadmin",
            icon: (
              <>
                <path d="M12 3l2.5 5 5.5.8-4 3.9.9 5.5L12 16l-4.9 2.2.9-5.5-4-3.9 5.5-.8z" />
              </>
            ),
          },
        ]
      : []),
  ].filter((item) =>
    item.href === "/radar" || item.href === "/alerta-vaga-certa" ? canSeeJobsLink : true,
  );
}

export const LEARN_MENU_ITEMS: UserMenuItem[] = [
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
];

function MenuIcon({ children }: { children: ReactNode }) {
  return (
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
      {children}
    </svg>
  );
}

export function AppHeaderUserMenu({
  userName,
  items,
  credits,
}: {
  userName: string;
  items: UserMenuItem[];
  credits?: number | "∞" | "—";
}) {
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

  return (
    <>
      <style>{`
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
      `}</style>
      <div style={{ position: "relative" }} ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className={`app-hdr-trigger${open ? " app-hdr-trigger--open" : ""}`}
          style={{ fontFamily: GEIST }}
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
          {credits !== undefined ? (
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
                {credits}
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
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`app-hdr-dd-item${item.href === "/meu-perfil" ? " app-hdr-dd-item--active" : ""}`}
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
              <MenuIcon>{item.icon}</MenuIcon>
              {item.label}
              {item.href === "/alerta-vaga-certa" ? (
                <span style={{ marginLeft: "auto" }}>
                  <MonitorNavBadge enabled />
                </span>
              ) : null}
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
            <MenuIcon>
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </MenuIcon>
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
          {LEARN_MENU_ITEMS.map((item) => (
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
              <MenuIcon>{item.icon}</MenuIcon>
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
              <MenuIcon>
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </MenuIcon>
              Sair
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
