import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeGuestCvMock = vi.hoisted(() => vi.fn());
const pollAnalysisJobMock = vi.hoisted(() => vi.fn());
const setPendingGuestAnalysisMock = vi.hoisted(() => vi.fn());
const setGuestAnalysisRawMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeGuestCv: analyzeGuestCvMock,
}));

vi.mock("@/lib/analysis-job-polling", () => ({
  pollAnalysisJob: pollAnalysisJobMock,
}));

vi.mock("@/lib/guest-analysis-pending", () => ({
  setPendingGuestAnalysis: setPendingGuestAnalysisMock,
}));

vi.mock("@/lib/guest-analysis-storage", () => ({
  setGuestAnalysisRaw: setGuestAnalysisRawMock,
}));

import { runGuestAnalysisFlow } from "./guest-analysis-flow";

const JOURNEY_CONTEXT = { sessionInternalId: "sid-1", visitorId: "vid-1" };

function buildFormData() {
  const formData = new FormData();
  formData.set("jobDescriptionText", "Vaga de exemplo");
  return formData;
}

describe("runGuestAnalysisFlow", () => {
  beforeEach(() => {
    analyzeGuestCvMock.mockReset();
    pollAnalysisJobMock.mockReset();
    setPendingGuestAnalysisMock.mockReset();
    setGuestAnalysisRawMock.mockReset();
  });

  it("analyzeGuestCv falha: retorna erro sem tocar storage/poll", async () => {
    analyzeGuestCvMock.mockResolvedValue({ ok: false, error: "boom" });

    const result = await runGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
      guestAnalysisAuthGateEnabled: true,
    });

    expect(result).toEqual({ kind: "error", error: "boom" });
    expect(pollAnalysisJobMock).not.toHaveBeenCalled();
    expect(setPendingGuestAnalysisMock).not.toHaveBeenCalled();
    expect(setGuestAnalysisRawMock).not.toHaveBeenCalled();
  });

  it("gate ON + sucesso: guarda pending e retorna destino de login", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-1",
      guestPossessionToken: "token-1",
      guestSessionPublicToken: "public-1",
    });

    const result = await runGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
      guestAnalysisAuthGateEnabled: true,
    });

    expect(result).toEqual({
      kind: "gated",
      destination: "/entrar?ctx=analysis_guest",
    });
    expect(setPendingGuestAnalysisMock).toHaveBeenCalledWith({
      jobId: "job-1",
      guestPossessionToken: "token-1",
    });
    expect(pollAnalysisJobMock).not.toHaveBeenCalled();
    expect(setGuestAnalysisRawMock).not.toHaveBeenCalled();
  });

  it("gate OFF + sucesso: faz polling, guarda resultado bruto e retorna destino de resultado", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-2",
      guestPossessionToken: null,
      guestSessionPublicToken: "public-2",
    });
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: { vaga: {} },
      previewText: "preview",
      masterCvText: "cv",
      analysisCvSnapshotId: "snapshot-1",
      jobTitle: "Analista",
      companyName: "Empresa",
    });

    const result = await runGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
      guestAnalysisAuthGateEnabled: false,
    });

    expect(result).toEqual({
      kind: "revealed",
      destination: "/adaptar/resultado",
    });
    expect(pollAnalysisJobMock).toHaveBeenCalledWith("job-2");
    expect(setGuestAnalysisRawMock).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(setGuestAnalysisRawMock.mock.calls[0][0]);
    expect(stored.guestSessionPublicToken).toBe("public-2");
    expect(stored.jobDescriptionText).toBe("Vaga de exemplo");
    expect(stored.analysisCvSnapshotId).toBe("snapshot-1");
    expect(setPendingGuestAnalysisMock).not.toHaveBeenCalled();
  });

  it("gate OFF + poll falha: retorna erro sem gravar storage", async () => {
    analyzeGuestCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-3",
      guestPossessionToken: null,
      guestSessionPublicToken: null,
    });
    pollAnalysisJobMock.mockResolvedValue({ ok: false, error: "timeout" });

    const result = await runGuestAnalysisFlow({
      formData: buildFormData(),
      journeyContext: JOURNEY_CONTEXT,
      guestAnalysisAuthGateEnabled: false,
    });

    expect(result).toEqual({ kind: "error", error: "timeout" });
    expect(setGuestAnalysisRawMock).not.toHaveBeenCalled();
  });
});
