import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { MockInterviewBrickCheckout } from "./brick-checkout";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Pagamento da entrevista simulada | EarlyCV",
};

export default async function PagamentoEntrevistaSimuladaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentAppUserFromCookies();
  if (!user) {
    redirect(
      `/entrar?tab=entrar&next=${encodeURIComponent(`/simulacao-de-entrevista/pagamento/${id}`)}`,
    );
  }
  return <MockInterviewBrickCheckout purchaseId={id} />;
}
