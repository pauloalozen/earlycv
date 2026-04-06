"use server";

import { adminUploadResumeTemplateFile } from "@/lib/admin-resume-templates-api";

export async function uploadTemplateFileAction(
  templateId: string,
  formData: FormData,
) {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    throw new Error("No file provided");
  }
  return adminUploadResumeTemplateFile(templateId, file);
}
