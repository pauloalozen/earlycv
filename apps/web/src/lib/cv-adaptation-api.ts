"use server";

import type { CvAdaptationStatus, PaymentStatus } from "@prisma/client";
import { apiRequest } from "./api-request";

export type CvAdaptationDto = {
  id: string;
  status: CvAdaptationStatus;
  jobTitle: string | null;
  companyName: string | null;
  previewText: string | null;
  masterResumeId: string;
  templateId: string | null;
  template: { id: string; name: string; slug: string } | null;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  adaptedResumeId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ListResponse<T> = {
  items: T[];
  total: number;
};

export async function createCvAdaptation(
  formData: FormData,
): Promise<CvAdaptationDto> {
  const response = await apiRequest("POST", "/cv-adaptation", formData);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create adaptation: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}

export async function getCvAdaptation(id: string): Promise<CvAdaptationDto> {
  const response = await apiRequest("GET", `/cv-adaptation/${id}`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch adaptation: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}

export async function listCvAdaptations(
  page = 1,
  limit = 20,
): Promise<ListResponse<CvAdaptationDto>> {
  const response = await apiRequest(
    "GET",
    `/cv-adaptation?page=${page}&limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error("Failed to list adaptations");
  }
  return response.json() as Promise<ListResponse<CvAdaptationDto>>;
}

export async function createCheckoutIntent(
  id: string,
): Promise<{ checkoutUrl: string; paymentReference: string }> {
  const response = await apiRequest("POST", `/cv-adaptation/${id}/checkout`);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create checkout intent: ${error}`);
  }
  return response.json() as Promise<{
    checkoutUrl: string;
    paymentReference: string;
  }>;
}

export async function confirmCvAdaptationPayment(
  id: string,
): Promise<CvAdaptationDto> {
  const response = await apiRequest(
    "POST",
    `/cv-adaptation/${id}/confirm-payment`,
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to confirm payment: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}

export async function deleteCvAdaptation(id: string): Promise<void> {
  const response = await apiRequest("DELETE", `/cv-adaptation/${id}`);
  if (!response.ok) {
    throw new Error("Failed to delete adaptation");
  }
}

export async function getCvAdaptationContent(
  id: string,
): Promise<{ adaptedContentJson: Record<string, unknown> }> {
  const response = await apiRequest("GET", `/cv-adaptation/${id}/content`);
  if (!response.ok) {
    throw new Error("Failed to fetch adaptation content");
  }
  return response.json() as Promise<{
    adaptedContentJson: Record<string, unknown>;
  }>;
}

export async function downloadCvAdaptationPdf(id: string): Promise<Blob> {
  const response = await apiRequest("GET", `/cv-adaptation/${id}/download`);
  if (!response.ok) {
    throw new Error("Failed to download PDF");
  }
  return response.blob();
}
