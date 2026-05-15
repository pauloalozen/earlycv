"use client";

import { usePathname } from "next/navigation";

const DEFAULT_MESSAGE =
  "Estamos com instabilidade temporaria em algumas funcionalidades. Se ocorrer erro, tente novamente em alguns minutos.";

const API_DEPENDENT_ROUTE_PREFIXES = [
  "/adaptar",
  "/auth",
  "/compras",
  "/cv-base",
  "/dashboard",
  "/entrar",
  "/esqueceu-senha",
  "/pagamento",
  "/registrar",
];

function normalizePathname(pathname: string) {
  if (!pathname) {
    return "/";
  }

  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

export function shouldShowIncidentBannerOnPathname(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);

  return API_DEPENDENT_ROUTE_PREFIXES.some((prefix) => {
    return (
      normalizedPathname === prefix ||
      normalizedPathname.startsWith(`${prefix}/`)
    );
  });
}

export function IncidentBanner() {
  const pathname = usePathname() ?? "/";
  const isEnabled =
    process.env.NEXT_PUBLIC_INCIDENT_BANNER_ENABLED?.trim().toLowerCase() ===
    "true";

  if (!isEnabled || !shouldShowIncidentBannerOnPathname(pathname)) {
    return null;
  }

  const message =
    process.env.NEXT_PUBLIC_INCIDENT_BANNER_MESSAGE?.trim() || DEFAULT_MESSAGE;

  return (
    <div className="sticky top-0 z-[60] border-b border-[#1111111f] bg-[#f5f5f5] px-4 py-2 text-center text-xs font-medium text-[#1a1a1a] md:px-8 md:text-sm">
      {message}
    </div>
  );
}
