"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  userName?: string | null;
  logoSize?: "sm" | "md";
};

export function AppHeader({ userName, logoSize = "md" }: Props) {
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

  const logoClass =
    logoSize === "sm"
      ? "font-logo text-xl tracking-tight"
      : "font-logo text-2xl tracking-tight";

  return (
    <header className="flex shrink-0 items-center justify-between px-8 py-4">
      <a href="/" style={{ color: "#111111" }} className={logoClass}>
        earlyCV
      </a>

      {userName ? (
        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-2 rounded-xl border border-[#E8E8E8] bg-white px-3 py-2 text-sm font-medium text-[#111111] transition-colors hover:bg-[#F5F5F5]"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#111111] text-[10px] font-bold text-white">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="max-w-[120px] truncate">{userName.split(" ")[0]}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-[#E8E8E8] bg-white shadow-lg">
              <a
                href="/adaptar"
                className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                onClick={() => setOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Adaptar CV
              </a>
              <a
                href="/dashboard"
                className="flex items-center gap-2.5 px-4 py-3 text-sm text-[#111111] transition-colors hover:bg-[#F5F5F5]"
                onClick={() => setOpen(false)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Meus CVs
              </a>
              <div className="mx-3 h-px bg-[#F0F0F0]" />
              <form action="/auth/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 px-4 py-3 text-sm text-[#888888] transition-colors hover:bg-[#F5F5F5] hover:text-[#111111]"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          href="/entrar"
          className="text-sm text-[#888888] transition-colors hover:text-[#111111]"
        >
          Entrar
        </a>
      )}
    </header>
  );
}
