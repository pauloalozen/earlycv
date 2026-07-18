import { extractApiErrorMessage } from "./cv-adaptation-api-errors";
import type { CvAnalysisData } from "./cv-adaptation-api";

export type AnalysisJobStatusDto = {
  jobId: string;
  status: "pending" | "processing" | "succeeded" | "failed";
  lastError: string | null;
  adaptedContentJson: CvAnalysisData | null;
  previewText: string | null;
  masterCvText: string | null;
  analysisCvSnapshotId: string | null;
};

export type AnalysisJobResult =
  | {
      ok: true;
      adaptedContentJson: CvAnalysisData;
      previewText: string;
      masterCvText: string;
      analysisCvSnapshotId: string;
    }
  | { ok: false; error: string };

// Mesma margem usada no polling de geração de CV (item 2 do plano de LLM
// assíncronas): a análise roda em background, sem risco de timeout de proxy,
// então só desistimos se passar tempo demais mesmo.
const POLL_TIMEOUT_MS = 8 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

export async function fetchAnalysisJobStatus(
  jobId: string,
): Promise<AnalysisJobStatusDto> {
  const response = await fetch(`/api/cv-adaptation/analysis-jobs/${jobId}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(
      extractApiErrorMessage(raw, "Falha ao consultar status da análise."),
    );
  }
  return response.json() as Promise<AnalysisJobStatusDto>;
}

export async function pollAnalysisJob(
  jobId: string,
  options?: { onTick?: (status: AnalysisJobStatusDto) => void },
): Promise<AnalysisJobResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    let status: AnalysisJobStatusDto;
    try {
      status = await fetchAnalysisJobStatus(jobId);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Falha ao consultar status da análise.",
      };
    }

    options?.onTick?.(status);

    if (status.status === "succeeded") {
      if (
        !status.adaptedContentJson ||
        !status.previewText ||
        !status.masterCvText ||
        !status.analysisCvSnapshotId
      ) {
        return {
          ok: false,
          error: "Análise concluída, mas o resultado veio incompleto.",
        };
      }
      return {
        ok: true,
        adaptedContentJson: status.adaptedContentJson,
        previewText: status.previewText,
        masterCvText: status.masterCvText,
        analysisCvSnapshotId: status.analysisCvSnapshotId,
      };
    }

    if (status.status === "failed") {
      return {
        ok: false,
        error: status.lastError ?? "Falha ao analisar CV. Tente novamente.",
      };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    ok: false,
    error: "A análise está demorando mais que o esperado. Tente novamente.",
  };
}
