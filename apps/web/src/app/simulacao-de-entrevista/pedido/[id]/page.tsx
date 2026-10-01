import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getMyMockInterview } from "@/lib/mock-interviews-api";
import { getMyPlan } from "@/lib/plans-api";
import { SANS } from "../../_components/flow-styles";
import { OrderStatus } from "./order-status";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Pedido da entrevista simulada | EarlyCV",
};

export default async function PedidoEntrevistaSimuladaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ retorno?: string }>;
}) {
  const { id } = await params;
  const { retorno } = await searchParams;

  const user = await getCurrentAppUserFromCookies();
  if (!user) {
    redirect(
      `/entrar?tab=entrar&next=${encodeURIComponent(`/simulacao-de-entrevista/pedido/${id}`)}`,
    );
  }

  // refresh: confere direto no Mercado Pago se o webhook ainda não chegou.
  const [purchase, planResult] = await Promise.all([
    getMyMockInterview(id, { refresh: true }),
    getMyPlan().then(
      (plan) => ({ ok: true as const, plan }),
      () => ({ ok: false as const }),
    ),
  ]);
  if (!purchase) notFound();

  return (
    <main
      style={{
        fontFamily: SANS,
        minHeight: "100dvh",
        background: "#ffffff",
        color: "#0a0a0a",
      }}
    >
      <AppHeader
        availableCredits={
          planResult.ok ? toHeaderAvailableCredits(planResult.plan) : "—"
        }
        userName={user.name}
        userRole={user.internalRole}
      />
      <PageShell>
        <div
          style={{ maxWidth: 560, margin: "0 auto", padding: "24px 16px 80px" }}
        >
          <OrderStatus
            initial={purchase}
            returnHint={
              retorno === "falhou" || retorno === "pendente" ? retorno : null
            }
          />
        </div>
      </PageShell>
    </main>
  );
}
