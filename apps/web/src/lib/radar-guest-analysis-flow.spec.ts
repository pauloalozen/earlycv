import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeGuestCvMock = vi.hoisted(() => vi.fn());
const setPendingGuestAnalysisMock = vi.hoisted(() => vi.fn());
const pollRadarAnalysisPreviewMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeGuestCv: analyzeGuestCvMock,
}));

vi.mock("@/lib/guest-analysis-pending", () => ({
  setPendingGuestAnalysis: setPendingGuestAnalysisMock,
}));

vi.mock("@/lib/radar-guest-analysis-preview", () => ({
  pollRadarAnalysisPreview: pollRadarAnalysisPreviewMock,
}));

import { runRadarGuestAnalysisFlow } from "./radar-guest-analysis-flow";

const JOURNEY_CONTEXT = { sessionInternalId: "sid-1", visitorId: "vid-1" };

function buildFormData() {
  const formData = new FormData();
  formData.set("radarJobId", "job-radar-1");
  return formData;
}

describe("runRadarGuestAnalysisFlow", () => {
  beforeEach(() => {
    analyzeGuestCvMock.mockReset();
    setPendingGuestAnalysisMock.mockReset();
    pollRadarAnalysisPreviewMock.mockReset();
  });

  it("analyzeGuestCv falha: retorna erro sem guardar pending nem chamar o poll do preview", async () => {
    analyzeGuestCvMock.mockResolvedValue({ ok: false, error: "boom" });

    const result = await runRadarGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({ kind: "error", error: "boom" });
    expect(setPendingGuestAnalysisMock).not.toHaveBeenCalled();
    expect(pollRadarAnalysisPreviewMock).not.toHaveBeenCalled();
  });

  it("analyzeGuestCv ok sem guestPossessionToken: retorna erro (nunca prossegue sem token de posse)", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      guestPossessionToken: null,
      guestSessionPublicToken: "public-1",
    });

    const result = await runRadarGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result.kind).toBe("error");
    expect(setPendingGuestAnalysisMock).not.toHaveBeenCalled();
    expect(pollRadarAnalysisPreviewMock).not.toHaveBeenCalled();
  });

  it("sucesso: guarda o mesmo pending guest usado pelo claim pós-signup e devolve o preview", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-radar-preview-1",
      guestPossessionToken: "possession-1",
      guestSessionPublicToken: "public-1",
    });
    const preview = {
      status: "succeeded" as const,
      lastError: null,
      jobTitle: "Engenheiro de Dados Jr",
      companyName: "Stefanini",
      score: { before: 68, after: 82 },
      breakdown: [
        { dimension: "skill", label: "Skills técnicas", coveragePercent: 75 },
      ],
      gapsCount: 2,
    };
    pollRadarAnalysisPreviewMock.mockResolvedValue({ ok: true, preview });

    const result = await runRadarGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({
      kind: "preview",
      jobId: "job-radar-preview-1",
      preview,
    });
    // Mesma chave sessionStorage que login-form/register-form/social-callback
    // já leem pra fazer o claim depois do cadastro — precisa ser gravada
    // ANTES de esperar o preview, nunca depois.
    expect(setPendingGuestAnalysisMock).toHaveBeenCalledWith({
      jobId: "job-radar-preview-1",
      guestPossessionToken: "possession-1",
    });
    expect(pollRadarAnalysisPreviewMock).toHaveBeenCalledWith(
      "job-radar-preview-1",
      "possession-1",
    );
  });

  it("poll do preview falha: retorna erro (pending já foi salvo, então o claim ainda pode funcionar depois do signup)", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-radar-preview-2",
      guestPossessionToken: "possession-2",
      guestSessionPublicToken: "public-2",
    });
    pollRadarAnalysisPreviewMock.mockResolvedValue({
      ok: false,
      error: "timeout",
    });

    const result = await runRadarGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({ kind: "error", error: "timeout" });
    expect(setPendingGuestAnalysisMock).toHaveBeenCalledWith({
      jobId: "job-radar-preview-2",
      guestPossessionToken: "possession-2",
    });
  });
});
