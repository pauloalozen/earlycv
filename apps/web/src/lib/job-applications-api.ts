"use server";

import { apiRequest } from "./api-request";

export type JobApplicationStatus =
  | "SAVED"
  | "ANALYZED"
  | "CV_READY"
  | "APPLIED"
  | "IN_PROCESS"
  | "INTERVIEW"
  | "ASSESSMENT"
  | "OFFER"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN";

export type JobApplicationOrigin =
  | "analysis_auto"
  | "optimized_cv_auto"
  | "manual"
  | "imported_url"
  | "job_portal";

export type JobApplicationEventType =
  | "APPLICATION_CREATED"
  | "ANALYSIS_COMPLETED"
  | "CV_READY"
  | "STATUS_CHANGED"
  | "NOTE_ADDED"
  | "MARKED_AS_SENT"
  | "INTERVIEW_PREP_GENERATED";

export type JobApplicationEvent = {
  id: string;
  jobApplicationId: string;
  eventType: JobApplicationEventType;
  previousStatus: JobApplicationStatus | null;
  newStatus: JobApplicationStatus | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type InterviewPrepContent = {
  strategySummary: string;
  strengthsToHighlight: string[];
  likelyRisksOrGaps: string[];
  questionsTheyMayAsk: Array<{
    question: string;
    whyItMatters: string;
    answerDirection: string;
  }>;
  questionsCandidateShouldAsk: string[];
  recommendedPosture: string[];
  finalChecklist: string[];
};

export type InterviewPrepDto = {
  id: string;
  jobApplicationId: string;
  generatedContentJson: InterviewPrepContent;
  generatedAt: string;
};

export type JobApplicationDto = {
  id: string;
  userId: string;
  jobTitle: string;
  companyName: string;
  location: string | null;
  jobUrl: string | null;
  jobDescriptionText: string | null;
  status: JobApplicationStatus;
  origin: JobApplicationOrigin;
  currentCvAdaptationId: string | null;
  scoreBefore: number | null;
  scoreAfter: number | null;
  notes: string | null;
  appliedAt: string | null;
  nextActionAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: JobApplicationEvent[];
  interviewPrep: { id: string; generatedAt: string } | null;
};

export type JobApplicationDetailDto = Omit<JobApplicationDto, "interviewPrep"> & {
  interviewPrep: InterviewPrepDto | null;
  cvAdaptations: Array<{
    id: string;
    status: string;
    jobTitle: string | null;
    companyName: string | null;
    isUnlocked: boolean;
    adaptedResumeId: string | null;
    createdAt: string;
  }>;
};

export type CreateJobApplicationInput = {
  jobTitle: string;
  companyName: string;
  location?: string;
  jobUrl?: string;
  jobDescriptionText?: string;
  notes?: string;
  origin?: JobApplicationOrigin;
};

export async function listJobApplications(
  page = 1,
  limit = 50,
): Promise<{ items: JobApplicationDto[]; total: number }> {
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });
  const response = await apiRequest("GET", `/job-applications?${qs}`);
  if (!response.ok) throw new Error("Falha ao carregar candidaturas");
  return response.json() as Promise<{ items: JobApplicationDto[]; total: number }>;
}

export async function getJobApplication(
  id: string,
): Promise<JobApplicationDetailDto> {
  const response = await apiRequest("GET", `/job-applications/${id}`);
  if (!response.ok) throw new Error("Candidatura não encontrada");
  return response.json() as Promise<JobApplicationDetailDto>;
}

export async function createJobApplication(
  input: CreateJobApplicationInput,
): Promise<JobApplicationDto> {
  const response = await apiRequest("POST", "/job-applications", {
    jobTitle: input.jobTitle,
    companyName: input.companyName,
    ...(input.location ? { location: input.location } : {}),
    ...(input.jobUrl ? { jobUrl: input.jobUrl, origin: "imported_url" as const } : { origin: input.origin ?? "manual" }),
    ...(input.jobDescriptionText ? { jobDescriptionText: input.jobDescriptionText } : {}),
    ...(input.notes ? { notes: input.notes } : {}),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "Erro ao criar candidatura");
    throw new Error(text);
  }
  return response.json() as Promise<JobApplicationDto>;
}

export async function updateJobApplicationStatus(
  id: string,
  status: JobApplicationStatus,
): Promise<JobApplicationDto> {
  const response = await apiRequest(
    "PATCH",
    `/job-applications/${id}/status`,
    { status },
  );
  if (!response.ok) throw new Error("Falha ao atualizar status");
  return response.json() as Promise<JobApplicationDto>;
}

export async function addJobApplicationNote(
  id: string,
  note: string,
): Promise<JobApplicationDto> {
  const response = await apiRequest(
    "POST",
    `/job-applications/${id}/notes`,
    { note },
  );
  if (!response.ok) throw new Error("Falha ao salvar nota");
  return response.json() as Promise<JobApplicationDto>;
}

export async function generateOrGetInterviewPrep(
  id: string,
): Promise<InterviewPrepDto> {
  const response = await apiRequest(
    "POST",
    `/job-applications/${id}/interview-prep`,
  );
  if (!response.ok) throw new Error("Falha ao gerar preparação para entrevista");
  return response.json() as Promise<InterviewPrepDto>;
}
