import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { canAccessMockInterview } from "@/lib/mock-interview-mode";
import { getMyMockInterview } from "@/lib/mock-interviews-api";
import { getMyPlan } from "@/lib/plans-api";
import { SANS } from "../../_components/flow-styles";
import { OrderStatus } from "./order-status";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Pedido da entrevista simulada",
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
        // Mesma cor do AppHeader: sem faixa de contraste entre header e corpo.
        background: "#f3f2ed",
        color: "#0a0a0a",
        display: "flex",
        flexDirection: "column",
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
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px 48px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 560 }}>
            <OrderStatus
              canBuy={canAccessMockInterview(user)}
              initial={purchase}
              returnHint={
                retorno === "falhou" || retorno === "pendente" ? retorno : null
              }
            />
          </div>
        </div>
      </PageShell>
    </main>
  );
}
