"use server";

import { apiRequest } from "./api-request";
import type { PublicJob } from "./public-jobs-api";

export type SavedJobItem = {
  savedJobId: string;
  savedAt: string;
  job: PublicJob;
};

export type SavedJobsPage = {
  items: SavedJobItem[];
  total: number;
  page: number;
  limit: number;
};

export async function saveJob(
  jobId: string,
  origin?: "RADAR" | "MONITOR",
): Promise<boolean> {
  const response = await apiRequest("POST", "/saved-jobs", {
    jobId,
    ...(origin ? { origin } : {}),
  });
  return response.ok;
}

export async function unsaveJob(jobId: string): Promise<boolean> {
  const response = await apiRequest("DELETE", `/saved-jobs/${jobId}`);
  return response.ok;
}

export async function listSavedJobs(
  page = 1,
  limit = 20,
  sort: "date_desc" | "date_asc" = "date_desc",
): Promise<SavedJobsPage> {
  const response = await apiRequest(
    "GET",
    `/saved-jobs?page=${page}&limit=${limit}&sort=${sort}`,
  );
  if (!response.ok) {
    throw new Error(`Saved jobs API ${response.status}`);
  }
  return (await response.json()) as SavedJobsPage;
}
