"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui";
import {
  buildBackofficeHref,
  getAdminNavItems,
} from "@/lib/admin-users-operations";
import { cn } from "@/lib/cn";

export function AdminSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const navItems = getAdminNavItems();
  const sectionLabel: Record<string, string> = {
    negocio: "Negocio",
    ingestion: "Ingestao",
    sistema: "Sistema",
  };
  let previousSection: string | null = null;

  function isActive(itemHref: string) {
    const [itemPathname, itemQuery] = itemHref.split("?");

    if (!itemQuery) {
      return (
        pathname === itemPathname ||
        (itemPathname !== "/admin" && pathname.startsWith(`${itemPathname}/`))
      );
    }

    if (pathname !== itemPathname) {
      return false;
    }

    const expectedParams = new URLSearchParams(itemQuery);
    return [...expectedParams.entries()].every(
      ([key, value]) => searchParams.get(key) === value,
    );
  }

  return (
    <aside className="border-b border-stone-200 bg-white/90 backdrop-blur-sm lg:fixed lg:inset-y-0 lg:w-72 lg:border-b-0 lg:border-r">
      <div className="flex h-full flex-col gap-6 px-5 py-6 lg:px-6">
        <div className="space-y-1">
          <p className="text-[11px] font-medium text-stone-400">
            EarlyCV Admin
          </p>
          <h2 className="text-lg font-semibold text-stone-950">
            Operacao interna
          </h2>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const shouldRenderSectionLabel =
              item.section && item.section !== previousSection;
            const currentSection = item.section;

            if (item.section) {
              previousSection = item.section;
            }

            return (
              <div className="space-y-0.5" key={item.href}>
                {shouldRenderSectionLabel ? (
                  <p className="px-3 pt-4 pb-1 text-[10px] font-medium uppercase tracking-wider text-stone-400 first:pt-0">
                    {currentSection ? sectionLabel[currentSection] : null}
                  </p>
                ) : null}
                <Link
                  className={cn(
                    "flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                    active
                      ? "bg-stone-950 !text-white"
                      : "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
                  )}
                  href={buildBackofficeHref(item.href)}
                >
                  <span>{item.label}</span>
                  {item.phase ? (
                    <Badge variant={active ? "accent" : "neutral"}>
                      {item.phase}
                    </Badge>
                  ) : null}
                </Link>
              </div>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
