"use server";

import { revalidatePath } from "next/cache";

import {
  setAdminUserAnalysisCredits,
  setAdminUserCredits,
} from "@/lib/admin-users-api";

export async function setUserCreditsAction(
  userId: string,
  _prevState: { message: string | null },
  formData: FormData,
) {
  const raw = formData.get("creditsRemaining");
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { message: "Informe um numero inteiro maior ou igual a zero." };
  }

  await setAdminUserCredits(userId, { creditsRemaining: parsed });

  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/usuarios");

  return { message: "Creditos atualizados com sucesso." };
}

export async function setUserAnalysisCreditsAction(
  userId: string,
  _prevState: { message: string | null },
  formData: FormData,
) {
  const raw = formData.get("analysisCreditsRemaining");
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return { message: "Informe um numero inteiro maior ou igual a zero." };
  }

  await setAdminUserAnalysisCredits(userId, {
    analysisCreditsRemaining: parsed,
  });

  revalidatePath(`/admin/usuarios/${userId}`);
  revalidatePath("/admin/usuarios");

  return { message: "Creditos de analise atualizados com sucesso." };
}
