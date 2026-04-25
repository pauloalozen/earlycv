"use server";

import { adminGetTemplateSignedUrls } from "@/lib/admin-resume-templates-api";

export async function getTemplateSignedUrlsAction(templateId: string) {
  return adminGetTemplateSignedUrls(templateId);
}
