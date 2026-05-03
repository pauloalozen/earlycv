"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui";
import {
  buildBackofficeHref,
  getAdminNavItems,
} from "@/lib/admin-users-operations";
import { cn } from "@/lib/cn";

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="border-b border-stone-200 bg-white/90 backdrop-blur-sm lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-5 py-6 lg:px-6">
        <div className="space-y-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-stone-500">
            earlycv admin
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-stone-950">
            Operacao interna
          </h2>
          <p className="text-sm leading-6 text-stone-500">
            Cadastros, continuidade de fluxo e ingestao manual centralizados.
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {getAdminNavItems().map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));

            return (
              <Link
                className={cn(
                  "flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-colors duration-200",
                  active
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                )}
                href={buildBackofficeHref(item.href)}
                key={item.href}
              >
                <span>{item.label}</span>
                {item.phase ? (
                  <Badge variant={active ? "accent" : "neutral"}>
                    {item.phase}
                  </Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
