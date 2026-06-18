"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV_ITEMS = [
  { id: "visao-geral", label: "Visão geral", href: "/admin", exact: true },
  { id: "usuarios", label: "Usuários", href: "/admin/usuarios" },
  { id: "pagamentos", label: "Pagamentos", href: "/admin/pagamentos" },
  { id: "recuperacao", label: "Recuperação", href: "/admin/payment-recovery" },
  { id: "liberacoes", label: "Liberações", href: "/admin/liberacoes-cv" },
  { id: "ingestao", label: "Ingestão", href: "/admin/ingestion" },
  { id: "templates", label: "Templates", href: "/admin/templates" },
  {
    id: "configuracoes",
    label: "Configurações",
    href: "/admin/configuracoes",
  },
  {
    id: "eventos",
    label: "Eventos & logs",
    href: "/admin/eventos-e-logs",
  },
] as const;

type AdminTopbarProps = {
  userInitial?: string;
  userName?: string;
};

export function AdminTopbar({
  userInitial = "A",
  userName = "admin",
}: AdminTopbarProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div
      style={{
        background: "#fafaf6",
        borderBottom: "1px solid rgba(10,10,10,0.08)",
        position: "relative",
        zIndex: 5,
      }}
    >
      <style>{`
        @media (max-width: 639px) {
          .admin-topbar-row1 { padding: 10px 14px 8px !important; }
          .admin-topbar-badge { display: none !important; }
          .admin-topbar-back-text { display: none !important; }
          .admin-topbar-username { display: none !important; }
          .admin-topbar-tabs { padding: 0 8px !important; scrollbar-width: none !important; }
          .admin-topbar-tabs::-webkit-scrollbar { display: none !important; }
        }
      `}</style>
      {/* Linha 1: brand + voltar + avatar */}
      <div
        className="admin-topbar-row1"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 32px 12px",
          borderBottom: "1px solid rgba(10,10,10,0.05)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <AdminLogoMark />
          <div
            className="admin-topbar-badge"
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10,
              letterSpacing: 1.4,
              color: "#8a8580",
              fontWeight: 500,
              padding: "3px 8px",
              borderRadius: 4,
              background: "#ebe9e3",
              border: "1px solid rgba(10,10,10,0.08)",
            }}
          >
            ADMIN · OPERAÇÃO INTERNA
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Link
            href="/dashboard"
            style={{
              fontSize: 12.5,
              color: "#6a6560",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 500,
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>←</span>
            <span className="admin-topbar-back-text">Voltar ao app</span>
          </Link>
          <div
            style={{ height: 18, width: 1, background: "rgba(10,10,10,0.08)" }}
          />
          {/* Avatar menu */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setMenuOpen((o) => !o)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px 5px 5px",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 999,
                background: "#fafaf6",
                cursor: "pointer",
                fontFamily: '"Geist", sans-serif',
              }}
              type="button"
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  fontSize: 11,
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: '"Geist", sans-serif',
                }}
              >
                {userInitial.toUpperCase()}
              </div>
              <span
                className="admin-topbar-username"
                style={{ fontSize: 12.5, color: "#0a0a0a", fontWeight: 500 }}
              >
                {userName}
              </span>
              <span
                className="admin-topbar-username"
                style={{
                  fontSize: 10,
                  color: "#8a8580",
                  fontFamily: '"Geist Mono", monospace',
                }}
              >
                ADMIN
              </span>
              <span style={{ fontSize: 10, color: "#8a8580", marginLeft: 2 }}>
                ▾
              </span>
            </button>

            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: "#fafaf6",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 8,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                  minWidth: 180,
                  zIndex: 50,
                  overflow: "hidden",
                }}
              >
                <form action="/auth/logout" method="post">
                  <button
                    style={{
                      width: "100%",
                      padding: "10px 14px",
                      textAlign: "left",
                      fontSize: 13,
                      color: "#9b2c2c",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: '"Geist", sans-serif',
                      fontWeight: 500,
                    }}
                    type="submit"
                  >
                    Encerrar sessão admin
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Linha 2: tabs */}
      <div
        className="admin-topbar-tabs"
        style={{
          display: "flex",
          gap: 2,
          padding: "0 32px",
          overflowX: "auto",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href, "exact" in item && item.exact);
          return (
            <Link
              key={item.id}
              href={item.href}
              style={{
                padding: "12px 14px 11px",
                fontSize: 13,
                fontWeight: 500,
                color: active ? "#0a0a0a" : "#6a6560",
                borderBottom: `2px solid ${active ? "#0a0a0a" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
                marginBottom: -1,
                textDecoration: "none",
                display: "inline-block",
                fontFamily: '"Geist", sans-serif',
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AdminLogoMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg
        aria-label="EarlyCV"
        width="22"
        height="22"
        viewBox="0 0 40 40"
        fill="none"
      >
        <rect x="0"  y="0"    width="12" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="16" y="0"    width="12" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="32" y="0"    width="8"  height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="0"  y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="0"  y="22.4" width="7"  height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
        <rect x="30" y="22.4" width="8"  height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="0"  y="33.5" width="22" height="6.5" rx="2" fill="#0a0a0a" />
        <rect x="26" y="33.5" width="9"  height="6.5" rx="2" fill="rgba(10,10,10,0.14)" />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 0 }}>
        <span
          style={{
            fontFamily: '"Geist", sans-serif',
            fontSize: 16,
            fontWeight: 300,
            letterSpacing: "-0.4px",
            color: "#0a0a0a",
            lineHeight: 1,
          }}
        >
          early
        </span>
        <span
          style={{
            fontFamily: '"Geist", sans-serif',
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "-0.4px",
            color: "#0a0a0a",
            lineHeight: 1,
          }}
        >
          CV
        </span>
      </div>
    </div>
  );
}
