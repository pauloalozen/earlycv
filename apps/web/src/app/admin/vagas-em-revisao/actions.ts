"use server";

import { revalidatePath } from "next/cache";

import {
  approvePendingReviewJob,
  rejectPendingReviewJob,
} from "@/lib/admin-job-review-api";

export async function approveReviewJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  await approvePendingReviewJob(jobId);
  revalidatePath("/admin/vagas-em-revisao");
}

export async function rejectReviewJobAction(formData: FormData) {
  const jobId = String(formData.get("jobId") ?? "");
  if (!jobId) return;
  await rejectPendingReviewJob(jobId);
  revalidatePath("/admin/vagas-em-revisao");
}
