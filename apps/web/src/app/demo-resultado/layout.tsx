import type { Metadata } from "next";
import type { ReactNode } from "react";

import { defaultOpenGraph, getAbsoluteUrl } from "@/lib/site";

// page.tsx é client component (não exporta metadata): a metadata da rota
// mora aqui.
const TITLE = "Exemplo de currículo adaptado para a vaga | EarlyCV";
const DESCRIPTION =
  "Veja um exemplo real de análise e adaptação de currículo para uma vaga: pontuação ATS, lacunas e a versão final ajustada.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: getAbsoluteUrl("/demo-resultado") },
  openGraph: {
    ...defaultOpenGraph,
    title: TITLE,
    description: DESCRIPTION,
    url: getAbsoluteUrl("/demo-resultado"),
  },
  // twitter substitui o objeto do layout raiz inteiro: repete o card.
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function DemoResultadoLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
