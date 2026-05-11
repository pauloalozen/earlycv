import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";

import { BrickCheckoutClientPage } from "./page.client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Finalizar pagamento | EarlyCV",
};

export default async function PagamentoCheckoutPage({
  params,
}: {
  params: Promise<{ purchaseId: string }>;
}) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/compras", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const { purchaseId } = await params;
  return <BrickCheckoutClientPage purchaseId={purchaseId} />;
}
