"use client";

import { useEffect, useRef, useState } from "react";
import {
  AppHeaderUserMenu,
  buildUserMenuItems,
  LEARN_MENU_ITEMS,
} from "@/components/app-header-user-menu";
import { Logo } from "@/components/logo";
import type { AppInternalRole } from "@/lib/app-session";

const MONO = "var(--font-geist-mono), monospace";
const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";

type UpcomingInterview = {
  id: string;
  jobTitle: string;
  companyName: string;
  nextActionAt: string;
  interviewTitle: string | null;
};

function formatInterviewDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round(
    (day.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Amanhã";
  if (diffDays <= 7) return `Em ${diffDays} dias`;
  return date.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}

type Props = {
  userName?: string | null;
  userRole?: AppInternalRole | null;
  logoSize?: "sm" | "md";
  backgroundColor?: string;
  variant?: "dark" | "light";
  availableCredits?: number | "∞" | "—";
};

const CREDIT_REDEEMED_EVENT = "dashboard:credit-redeemed";

export function AppHeader({
  userName,
  userRole,
  logoSize = "md",
  backgroundColor = "rgba(243,242,237,0.95)",
  variant = "dark",
  availableCredits,
}: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuCredits, setMenuCredits] = useState<
    number | "∞" | "—" | undefined
  >(availableCredits);
  const [bellOpen, setBellOpen] = useState(false);
  const [upcomingInterviews, setUpcomingInterviews] = useState<
    UpcomingInterview[]
  >([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const bellRef = useRef<HTMLDivElement>(null);

  const mobileBg =
    backgroundColor !== "transparent" ? backgroundColor : "#f9f8f4";
  const menuItems = buildUserMenuItems({ userRole });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("earlycv_notif_dismissed");
      if (stored) setDismissedIds(new Set(JSON.parse(stored) as string[]));
    } catch {}
  }, []);

  useEffect(() => {
    if (!userName) return;
    fetch("/api/job-applications/upcoming-interviews")
      .then((r) => r.json())
      .then((data: { items?: UpcomingInterview[] }) =>
        setUpcomingInterviews(data.items ?? []),
      )
      .catch(() => {});
  }, [userName]);

  function dismissNotification(id: string) {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(
          "earlycv_notif_dismissed",
          JSON.stringify([...next]),
        );
      } catch {}
      return next;
    });
  }

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

  const visibleInterviews = upcomingInterviews.filter(
    (iv) => !dismissedIds.has(iv.id),
  );

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
        .app-hdr-bell-btn {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 34px;
          height: 34px;
          background: none;
          border: 1px solid transparent;
          border-radius: 50%;
          cursor: pointer;
          color: #0a0a0a;
          margin-right: 8px;
          transition: background-color 120ms ease, border-color 120ms ease;
          flex-shrink: 0;
        }
        .app-hdr-bell-btn:hover,
        .app-hdr-bell-btn--open {
          background: rgba(10,10,10,0.05);
          border-color: rgba(10,10,10,0.1);
        }
        .app-hdr-bell-badge {
          position: absolute;
          top: 1px;
          right: 1px;
          min-width: 14px;
          height: 14px;
          border-radius: 999px;
          background: #e53e3e;
          color: #fff;
          font-size: 8px;
          font-weight: 700;
          font-family: ${MONO};
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 3px;
          border: 1.5px solid #fff;
        }
        .app-hdr-notif-dd {
          opacity: 0;
          transform: translateY(-6px) scale(0.98);
          pointer-events: none;
          transition: opacity 160ms cubic-bezier(.3,.9,.4,1), transform 160ms cubic-bezier(.3,.9,.4,1);
          transform-origin: top right;
        }
        .app-hdr-notif-dd--open {
          opacity: 1;
          transform: translateY(0) scale(1);
          pointer-events: auto;
        }
        .app-hdr-notif-item {
          border-radius: 9px;
          padding: 10px 28px 10px 12px;
          background: rgba(10,10,10,0.03);
          border: 1px solid rgba(10,10,10,0.06);
          text-decoration: none;
          display: block;
          transition: background-color 120ms ease;
        }
        .app-hdr-notif-item:hover {
          background: rgba(10,10,10,0.07);
        }
        .app-hdr-notif-row {
          position: relative;
          margin-bottom: 4px;
        }
        .app-hdr-notif-dismiss {
          position: absolute;
          top: 7px;
          right: 7px;
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: #a0a09a;
          border-radius: 4px;
          padding: 0;
          transition: color 120ms ease, background-color 120ms ease;
        }
        .app-hdr-notif-dismiss:hover {
          color: #c0392b;
          background: rgba(192,57,43,0.1);
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
              v2.1
            </span>
          </a>

          {/* Desktop right */}
          <div className="app-hdr-desktop" style={{ alignItems: "center" }}>
            {userName && visibleInterviews.length > 0 && (
              <div style={{ position: "relative" }} ref={bellRef}>
                <button
                  type="button"
                  onClick={() => setBellOpen((o) => !o)}
                  className={`app-hdr-bell-btn${bellOpen ? " app-hdr-bell-btn--open" : ""}`}
                  aria-label="Notificações"
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
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  <span className="app-hdr-bell-badge">
                    {visibleInterviews.length}
                  </span>
                </button>

                <div
                  className={`app-hdr-notif-dd${bellOpen ? " app-hdr-notif-dd--open" : ""}`}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "calc(100% + 8px)",
                    zIndex: 50,
                    width: 280,
                    background: "#fafaf6",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 14,
                    boxShadow:
                      "0 1px 2px rgba(0,0,0,0.04), 0 16px 40px -10px rgba(10,10,10,0.14)",
                    padding: 10,
                  }}
                >
                  <p
                    style={{
                      margin: "0 2px 8px",
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: 1.1,
                      color: "#8a8a85",
                      fontWeight: 500,
                      textTransform: "uppercase",
                    }}
                  >
                    Entrevistas agendadas
                  </p>
                  {visibleInterviews.map((iv) => (
                    <div key={iv.id} className="app-hdr-notif-row">
                      <a
                        href={`/candidaturas/${iv.id}`}
                        onClick={() => {
                          setBellOpen(false);
                          dismissNotification(iv.id);
                        }}
                        className="app-hdr-notif-item"
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 4,
                          }}
                        >
                          <svg
                            aria-hidden="true"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#e53e3e"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            style={{ flexShrink: 0 }}
                          >
                            <rect
                              x="3"
                              y="4"
                              width="18"
                              height="18"
                              rx="2"
                              ry="2"
                            />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                          </svg>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 9,
                              fontWeight: 700,
                              color: "#e53e3e",
                              textTransform: "uppercase",
                              letterSpacing: 0.8,
                            }}
                          >
                            {iv.nextActionAt
                              ? formatInterviewDate(iv.nextActionAt)
                              : "Em breve"}
                          </span>
                        </div>
                        <p
                          style={{
                            margin: "0 0 2px",
                            fontFamily: GEIST,
                            fontSize: 13,
                            fontWeight: 600,
                            color: "#0a0a0a",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {iv.jobTitle}
                        </p>
                        <p
                          style={{
                            margin: "0 0 6px",
                            fontFamily: GEIST,
                            fontSize: 12,
                            color: "#6a6560",
                          }}
                        >
                          {iv.companyName}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontFamily: GEIST,
                            fontSize: 11.5,
                            color: "#4a4a45",
                          }}
                        >
                          Não esqueça de se preparar para a entrevista!
                        </p>
                      </a>
                      <button
                        type="button"
                        className="app-hdr-notif-dismiss"
                        aria-label="Dispensar notificação"
                        onClick={() => dismissNotification(iv.id)}
                      >
                        <svg
                          aria-hidden="true"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {userName ? (
              <AppHeaderUserMenu
                userName={userName}
                items={menuItems}
                credits={menuCredits}
              />
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
            {menuItems.map((item) => (
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
            {visibleInterviews.length > 0 && (
              <>
                <div className="app-hdr-mob-nav-sep" />
                <p className="app-hdr-mob-nav-section-title">
                  Entrevistas agendadas
                </p>
                {visibleInterviews.map((iv) => (
                  <div
                    key={iv.id}
                    style={{ position: "relative", margin: "0 16px 8px" }}
                  >
                    <a
                      href={`/candidaturas/${iv.id}`}
                      onClick={() => {
                        setMobileOpen(false);
                        dismissNotification(iv.id);
                      }}
                      style={{
                        display: "block",
                        padding: "10px 36px 10px 12px",
                        borderRadius: 9,
                        background: "rgba(229,62,62,0.06)",
                        border: "1px solid rgba(229,62,62,0.15)",
                        textDecoration: "none",
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 2px",
                          fontFamily: MONO,
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#e53e3e",
                          textTransform: "uppercase",
                          letterSpacing: 0.8,
                        }}
                      >
                        {iv.nextActionAt
                          ? formatInterviewDate(iv.nextActionAt)
                          : "Em breve"}
                      </p>
                      <p
                        style={{
                          margin: "0 0 2px",
                          fontFamily: GEIST,
                          fontSize: 14,
                          fontWeight: 600,
                          color: "#0a0a0a",
                        }}
                      >
                        {iv.jobTitle}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontFamily: GEIST,
                          fontSize: 12,
                          color: "#6a6560",
                        }}
                      >
                        {iv.companyName}
                      </p>
                    </a>
                    <button
                      type="button"
                      className="app-hdr-notif-dismiss"
                      aria-label="Dispensar notificação"
                      onClick={() => dismissNotification(iv.id)}
                    >
                      <svg
                        aria-hidden="true"
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </>
            )}
            <div className="app-hdr-mob-nav-sep" />
            <p className="app-hdr-mob-nav-section-title">Aprender</p>
            {LEARN_MENU_ITEMS.map((item) => (
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
