"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { apiRequest } from "@/lib/api-request";

import {
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
