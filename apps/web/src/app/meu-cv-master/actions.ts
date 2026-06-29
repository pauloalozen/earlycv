"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiRequest } from "@/lib/api-request";

import {
  buildClearAllPayload,
  buildClearBlockPayload,
  buildProfileBlockUpdatePayload,
  type ProfileBlockId,
} from "./profile-blocks";

export async function saveProfileBlockAction(
  blockId: ProfileBlockId,
  formData: FormData,
) {
  const payload = buildProfileBlockUpdatePayload(blockId, formData);
  const response = await apiRequest("PUT", "/users/profile", payload);

  if (!response.ok) {
    throw new Error("Falha ao salvar o bloco do CV Master");
  }

  const focus = formData.get("focus");
  const focusBlockId = typeof focus === "string" && focus ? focus : blockId;

  revalidatePath("/meu-cv-master");
  redirect(`/meu-cv-master?focus=${encodeURIComponent(focusBlockId)}`);
}

export async function clearProfileBlockAction(blockId: ProfileBlockId) {
  const payload = buildClearBlockPayload(blockId);
  const response = await apiRequest("PUT", "/users/profile", payload);

  if (!response.ok) {
    throw new Error("Falha ao limpar o bloco");
  }

  revalidatePath("/meu-cv-master");
  redirect("/meu-cv-master");
}

export async function clearAllProfileAction() {
  const payload = buildClearAllPayload();
  const response = await apiRequest("PUT", "/users/profile", payload);

  if (!response.ok) {
    throw new Error("Falha ao limpar o perfil");
  }

  revalidatePath("/meu-cv-master");
  redirect("/meu-cv-master");
}

export async function clearAllProfileAndResumeAction() {
  const payload = buildClearAllPayload();
  const profileResponse = await apiRequest("PUT", "/users/profile", payload);

  if (!profileResponse.ok) {
    throw new Error("Falha ao limpar o perfil");
  }

  const listResponse = await apiRequest("GET", "/resumes");
  if (listResponse.ok) {
    const resumes = (await listResponse.json()) as Array<{ id: string }>;
    for (const resume of resumes) {
      await apiRequest("DELETE", `/resumes/${resume.id}`);
    }
  }

  revalidatePath("/meu-cv-master");
  redirect("/meu-cv-master");
}

export async function clearAllProfileForReupload() {
  const payload = buildClearAllPayload();
  const response = await apiRequest("PUT", "/users/profile", payload);

  if (!response.ok) {
    throw new Error("Falha ao limpar o perfil");
  }

  revalidatePath("/meu-cv-master");
}
