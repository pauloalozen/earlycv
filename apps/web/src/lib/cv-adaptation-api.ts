"use server";

import type { CvAdaptationStatus, PaymentStatus } from "@prisma/client";
import { apiRequest } from "./api-request";
import { extractApiErrorMessage } from "./cv-adaptation-api-errors";

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

export async function createCvAdaptationFromMaster(payload: {
  masterResumeId: string;
  jobDescriptionText: string;
}): Promise<CvAdaptationDto> {
  const response = await apiRequest("POST", "/cv-adaptation", payload);
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

export type CvAnalysisData = {
  vaga: {
    cargo: string;
    empresa: string;
  };
  fit: {
    score: number;
    /** Presente em análises novas */
    score_pos_ajustes?: number;
    categoria: "baixo" | "medio" | "alto";
    headline: string;
    subheadline: string;
  };
  /** Presente em análises novas — scores por seção (experiência 0-40 + competências 0-40 + formatação 0-20 = fit.score) */
  secoes?: {
    experiencia: { score: number; max: number };
    competencias: { score: number; max: number };
    formatacao: { score: number; max: number };
  };
  /** Presente em análises novas — pontos fortes com peso relativo */
  positivos?: Array<{ texto: string; pontos: number }>;
  /** Presente em análises novas — ajustes de conteúdo com ganho estimado */
  ajustes_conteudo?: Array<{
    id?: string;
    titulo: string;
    descricao: string;
    pontos: number;
    dica: string;
  }>;
  /** Presente em análises novas — keywords com impacto por item */
  keywords?: {
    presentes: Array<{ kw: string; pontos: number }>;
    ausentes: Array<{ kw: string; pontos: number }>;
  };
  /** Presente em análises novas — análise de formato ATS */
  formato_cv?: {
    ats_score: number;
    resumo: string;
    problemas: Array<{
      tipo: "critico" | "atencao" | "ok";
      titulo: string;
      descricao: string;
      impacto: number;
    }>;
    campos: Array<{ nome: string; presente: boolean }>;
  };
  comparacao: {
    antes: string;
    depois: string;
  };
  // Campos legados — presentes em todas as análises
  pontos_fortes: string[];
  lacunas: string[];
  melhorias_aplicadas: string[];
  ats_keywords: {
    presentes: string[];
    ausentes: string[];
  };
  preview: {
    antes: string;
    depois: string;
  };
  projecao_melhoria: {
    score_atual: number;
    score_pos_otimizacao: number;
    explicacao_curta: string;
  };
  mensagem_venda: {
    titulo: string;
    subtexto: string;
  };
  adaptation_notes?: string;
};

export type GuestAnalysisResult = {
  adaptedContentJson: CvAnalysisData;
  previewText: string;
  masterCvText: string;
};

export async function analyzeGuestCv(
  formData: FormData,
): Promise<GuestAnalysisResult> {
  const response = await apiRequest(
    "POST",
    "/cv-adaptation/analyze-guest",
    formData,
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      extractApiErrorMessage(error, "Falha ao analisar CV. Tente novamente."),
    );
  }
  return response.json() as Promise<GuestAnalysisResult>;
}

export async function claimGuestAnalysis(payload: {
  adaptedContentJson: Record<string, unknown>;
  previewText?: string;
  jobDescriptionText: string;
  masterCvText: string;
  jobTitle?: string;
  companyName?: string;
}): Promise<CvAdaptationDto> {
  const response = await apiRequest(
    "POST",
    "/cv-adaptation/claim-guest",
    payload,
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to claim guest analysis: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}

export async function saveGuestPreview(payload: {
  adaptedContentJson: Record<string, unknown>;
  previewText?: string;
  jobDescriptionText: string;
  masterCvText: string;
  jobTitle?: string;
  companyName?: string;
}): Promise<CvAdaptationDto> {
  const response = await apiRequest(
    "POST",
    "/cv-adaptation/save-guest-preview",
    payload,
  );
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to save guest preview: ${error}`);
  }
  return response.json() as Promise<CvAdaptationDto>;
}

export async function analyzeAuthenticatedCv(
  formData: FormData,
): Promise<GuestAnalysisResult> {
  const response = await apiRequest("POST", "/cv-adaptation/analyze", formData);
  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      extractApiErrorMessage(error, "Falha ao analisar CV. Tente novamente."),
    );
  }
  return response.json() as Promise<GuestAnalysisResult>;
}

export async function downloadCvAdaptationPdf(id: string): Promise<Blob> {
  const response = await apiRequest("GET", `/cv-adaptation/${id}/download`);
  if (!response.ok) {
    throw new Error("Failed to download PDF");
  }
  return response.blob();
}
