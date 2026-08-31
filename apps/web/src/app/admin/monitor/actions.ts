"use server";

import { revalidatePath } from "next/cache";

import {
  forceAdminMonitorUserRematch,
  requeueAdminMonitorMatchJob,
  requeueAdminMonitorProfileMatchJob,
  resendAdminMonitorDigest,
} from "@/lib/admin-monitor-api";

// Cada action só delega para AdminMonitorService (via admin-monitor-api) —
// nenhuma escrita acontece aqui. revalidatePath re-busca a página que
// disparou a ação, então o resultado (novo status PENDING, log de auditoria)
// aparece na mesma tela sem precisar de client-side state.

export async function requeueMatchJobAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const redirectPath = String(formData.get("redirectPath") ?? "/admin/monitor");
  if (!id) return;

  await requeueAdminMonitorMatchJob(id);
  revalidatePath(redirectPath);
}

export async function requeueProfileMatchJobAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const redirectPath = String(formData.get("redirectPath") ?? "/admin/monitor");
  if (!id) return;

  await requeueAdminMonitorProfileMatchJob(id);
  revalidatePath(redirectPath);
}

export async function forceUserRematchAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "").trim();
  const redirectPath = String(formData.get("redirectPath") ?? "/admin/monitor");
  if (!userId) return;

  await forceAdminMonitorUserRematch(userId);
  revalidatePath(redirectPath);
}

export async function resendDigestAction(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const redirectPath = String(formData.get("redirectPath") ?? "/admin/monitor");
  if (!id) return;

  await resendAdminMonitorDigest(id);
  revalidatePath(redirectPath);
}
