import {
  extractApiErrorMessage,
  sanitizeDomainErrorMessage,
} from "./cv-adaptation-api-errors";

export type RadarAnalysisPreviewStatus =
  | "pending"
  | "processing"
  | "succeeded"
  | "failed";

export type RadarAnalysisPreview = {
  status: RadarAnalysisPreviewStatus;
  lastError: string | null;
  jobTitle: string | null;
  companyName: string | null;
  score: { before: number | null; after: number | null } | null;
  breakdown:
    | { dimension: string; label: string; coveragePercent: number }[]
    | null;
  gapsCount: number | null;
};

export type SucceededRadarAnalysisPreview = RadarAnalysisPreview & {
  status: "succeeded";
};

export type RadarAnalysisPreviewResult =
  | { ok: true; preview: SucceededRadarAnalysisPreview }
  | { ok: false; error: string };

// Mesma janela de recuperação de "processing travado" documentada em
// analysis-job-polling.ts (STALE_PROCESSING_THRESHOLD_MS = 10min no
// backend) — o timeout do frontend precisa ficar acima disso.
const POLL_TIMEOUT_MS = 11 * 60 * 1000;
const POLL_INTERVAL_MS = 3000;

async function fetchRadarAnalysisPreview(
  jobId: string,
  guestPossessionToken: string,
): Promise<RadarAnalysisPreview> {
  const response = await fetch(
    `/api/cv-adaptation/analysis-jobs/${jobId}/radar-preview`,
    {
      headers: { "x-guest-possession-token": guestPossessionToken },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const raw = await response.text();
    throw new Error(
      extractApiErrorMessage(raw, "Falha ao consultar o preview da análise."),
    );
  }
  return response.json() as Promise<RadarAnalysisPreview>;
}

// Poll dedicado ao preview do Radar — nunca reaproveita pollAnalysisJob
// (analysis-job-polling.ts), que devolve o CvAdaptationOutput completo:
// aqui o resultado nunca deve incluir mais do que score/breakdown/gapsCount,
// então usa o endpoint radar-preview desde a primeira chamada.
export async function pollRadarAnalysisPreview(
  jobId: string,
  guestPossessionToken: string,
  options?: { onTick?: (preview: RadarAnalysisPreview) => void },
): Promise<RadarAnalysisPreviewResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    let preview: RadarAnalysisPreview;
    try {
      preview = await fetchRadarAnalysisPreview(jobId, guestPossessionToken);
    } catch (err) {
      return {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Falha ao consultar o preview da análise.",
      };
    }

    options?.onTick?.(preview);

    if (preview.status === "succeeded") {
      return {
        ok: true,
        preview: preview as SucceededRadarAnalysisPreview,
      };
    }

    if (preview.status === "failed") {
      return {
        ok: false,
        error: sanitizeDomainErrorMessage(
          preview.lastError,
          "Falha ao analisar CV. Tente novamente.",
        ),
      };
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return {
    ok: false,
    error: "A análise está demorando mais que o esperado. Tente novamente.",
  };
}
