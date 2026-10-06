"use server";

import { revalidatePath } from "next/cache";
import {
  type AdminMockInterviewInviteOutcome,
  type AdminMockInterviewUpdate,
  resendAdminMockInterviewInvite,
  updateAdminMockInterview,
} from "@/lib/admin-mock-interviews-api";

export async function updateMockInterviewAction(
  id: string,
  body: AdminMockInterviewUpdate,
): Promise<
  | { ok: true; invite: AdminMockInterviewInviteOutcome }
  | { ok: false; message: string }
> {
  try {
    const result = await updateAdminMockInterview(id, body);
    revalidatePath(`/admin/simulados/${id}`);
    revalidatePath("/admin/simulados");
    return { ok: true, invite: result.invite ?? null };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Não foi possível salvar.",
    };
  }
}

export async function resendMockInterviewInviteAction(
  id: string,
): Promise<
  | { ok: true; invite: AdminMockInterviewInviteOutcome }
  | { ok: false; message: string }
> {
  try {
    const result = await resendAdminMockInterviewInvite(id);
    revalidatePath(`/admin/simulados/${id}`);
    return { ok: true, invite: result.invite ?? null };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Não foi possível reenviar o convite.",
    };
  }
}
