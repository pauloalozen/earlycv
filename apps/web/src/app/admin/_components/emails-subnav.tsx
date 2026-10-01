"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { EMAILS_TABS, resolveActiveEmailsTab } from "@/lib/admin-emails-nav";

import { AT } from "./admin-primitives";

// Sub-navegação da aba única "Emails": as abas antigas (Alerta de Vagas,
// Product Updates, Recuperação) mantêm suas rotas e ganham esta barra pelo
// layout de cada rota; as telas novas ficam em /admin/emails/*.
export function EmailsSubNav() {
  const pathname = usePathname();
  const active = resolveActiveEmailsTab(pathname);

  return (
    <nav
      aria-label="Emails"
      className="admin-emails-subnav"
      style={{
        maxWidth: 1440,
        margin: "0 auto",
        padding: "14px 32px 0",
      }}
    >
      <style>{`
        .admin-emails-subnav-row { scrollbar-width: none; }
        .admin-emails-subnav-row::-webkit-scrollbar { display: none; }
        @media (max-width: 639px) {
          .admin-emails-subnav { padding: 12px 14px 0 !important; }
        }
      `}</style>
      <div
        className="admin-emails-subnav-row"
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {EMAILS_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              style={{
                padding: "6px 12px",
                borderRadius: 999,
                fontSize: 12.5,
                fontWeight: 500,
                whiteSpace: "nowrap",
                background: isActive ? AT.ink : "transparent",
                color: isActive ? AT.card : AT.muted,
                border: `1px solid ${isActive ? AT.ink : AT.border}`,
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
