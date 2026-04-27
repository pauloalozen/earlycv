"use server";

import { revalidatePath } from "next/cache";
import { reconcileAdminPayment } from "@/lib/admin-payments-api";

export async function reconcilePaymentAction(checkoutId: string) {
  const result = await reconcileAdminPayment(checkoutId);
  if (result.reconciled) {
    revalidatePath(`/admin/pagamentos/${checkoutId}`);
    revalidatePath("/admin/pagamentos");
  }
  return result;
}
