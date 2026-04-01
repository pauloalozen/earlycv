"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  buildBackofficeHref,
  getSuperadminNavItems,
} from "@/lib/admin-users-operations";
import { cn } from "@/lib/cn";

export function SuperadminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-slate-200 bg-white/88 backdrop-blur-sm lg:fixed lg:inset-y-0 lg:w-80 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-5 py-6 lg:px-7">
        <div className="space-y-3 rounded-[28px] border border-slate-200 bg-linear-to-br from-slate-950 via-slate-900 to-teal-900 px-5 py-6 text-white shadow-[0_24px_60px_-32px_rgba(15,23,42,0.7)]">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-teal-100/80">
            earlycv superadmin
          </p>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight">
              Camada institucional
            </h2>
            <p className="text-sm leading-6 text-slate-200">
              Governanca interna, equipe operacional e frentes sensiveis do
              produto.
            </p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1.5">
          {getSuperadminNavItems().map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/superadmin" &&
                pathname.startsWith(`${item.href}/`));

            return (
              <Link
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm font-semibold transition-colors duration-200",
                  active
                    ? "bg-slate-900 text-white shadow-[0_18px_40px_-28px_rgba(15,23,42,0.9)]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
                )}
                href={buildBackofficeHref(item.href)}
                key={item.href}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
          Navegacao protegida por sessao interna em cookie HttpOnly para manter
          o bearer token fora da URL.
        </div>
      </div>
    </aside>
  );
}
