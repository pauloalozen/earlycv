"use server";

import { revalidatePath } from "next/cache";

import {
  ignoreAdminPaymentRecoveryPurchase,
  sendAdminPaymentRecoveryEmail,
  unignoreAdminPaymentRecoveryPurchase,
} from "@/lib/admin-payment-recovery-api";

export type RecoveryActionUiResult = {
  kind: "error" | "success";
  message: string;
};

function parseErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return "Falha de rede. Tente novamente.";
  }
  if (error.message.includes("API 401") || error.message.includes("API 403")) {
    return "Acesso negado para esta operacao.";
  }
  return "Falha de rede ou servidor. Tente novamente.";
}

function mapSendMessage(status?: string, reason?: string) {
  if (status === "sent") return "Email enviado com sucesso.";
  if (status === "dry_run") return "Ambiente em dry-run: envio simulado.";
  if (status === "allowlist_blocked")
    return "Envio bloqueado por allowlist do ambiente.";
  if (status === "already_sent" || reason === "already_sent")
    return "Este pedido ja recebeu email anteriormente.";
  return "Nao foi possivel enviar o email.";
}

export async function sendRecoveryEmailAction(
  purchaseId: string,
): Promise<RecoveryActionUiResult> {
  try {
    const result = await sendAdminPaymentRecoveryEmail(purchaseId);
    revalidatePath("/admin/payment-recovery");
    return {
      kind: result.ok ? "success" : "error",
      message: mapSendMessage(result.status, result.reason),
    };
  } catch (error) {
    return { kind: "error", message: parseErrorMessage(error) };
  }
}

export async function ignoreRecoveryAction(
  purchaseId: string,
  reason?: string,
): Promise<RecoveryActionUiResult> {
  try {
    await ignoreAdminPaymentRecoveryPurchase(purchaseId, reason);
    revalidatePath("/admin/payment-recovery");
    return { kind: "success", message: "Pedido marcado como ignorado." };
  } catch (error) {
    return { kind: "error", message: parseErrorMessage(error) };
  }
}

export async function unignoreRecoveryAction(
  purchaseId: string,
): Promise<RecoveryActionUiResult> {
  try {
    await unignoreAdminPaymentRecoveryPurchase(purchaseId);
    revalidatePath("/admin/payment-recovery");
    return { kind: "success", message: "Pedido removido da lista de ignorados." };
  } catch (error) {
    return { kind: "error", message: parseErrorMessage(error) };
  }
}
