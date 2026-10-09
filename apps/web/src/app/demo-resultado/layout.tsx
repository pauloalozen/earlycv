import type { Metadata } from "next";
import type { ReactNode } from "react";

import { defaultOpenGraph, getAbsoluteUrl } from "@/lib/site";

// page.tsx é client component (não exporta metadata): o canonical da rota
// mora aqui.
export const metadata: Metadata = {
  alternates: { canonical: getAbsoluteUrl("/demo-resultado") },
  openGraph: { ...defaultOpenGraph, url: getAbsoluteUrl("/demo-resultado") },
};

export default function DemoResultadoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
