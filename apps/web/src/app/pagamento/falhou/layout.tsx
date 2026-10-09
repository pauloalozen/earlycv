import type { Metadata } from "next";
import type { ReactNode } from "react";

// Tela de fluxo (page.tsx é client component): fora do índice, sem
// canonical. Os links continuam valendo pro crawler seguir.
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function PagamentoFalhouLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
