"use server";

import { revalidatePath } from "next/cache";
import {
  type AdminMockInterviewUpdate,
  updateAdminMockInterview,
} from "@/lib/admin-mock-interviews-api";

export async function updateMockInterviewAction(
  id: string,
  body: AdminMockInterviewUpdate,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await updateAdminMockInterview(id, body);
    revalidatePath(`/admin/simulados/${id}`);
    revalidatePath("/admin/simulados");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}
