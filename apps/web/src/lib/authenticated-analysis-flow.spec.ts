import { beforeEach, describe, expect, it, vi } from "vitest";

const analyzeAuthenticatedCvMock = vi.hoisted(() => vi.fn());
const saveGuestPreviewMock = vi.hoisted(() => vi.fn());
const pollAnalysisJobMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: analyzeAuthenticatedCvMock,
  saveGuestPreview: saveGuestPreviewMock,
}));

vi.mock("@/lib/analysis-job-polling", () => ({
  pollAnalysisJob: pollAnalysisJobMock,
}));

import { runAuthenticatedAnalysisFlow } from "./authenticated-analysis-flow";

const JOURNEY_CONTEXT = { sessionInternalId: "sid-1", visitorId: "vid-1" };

function buildFormData() {
  const formData = new FormData();
  formData.set("jobDescriptionText", "Vaga de exemplo");
  return formData;
}

describe("runAuthenticatedAnalysisFlow", () => {
  beforeEach(() => {
    analyzeAuthenticatedCvMock.mockReset();
    saveGuestPreviewMock.mockReset();
    pollAnalysisJobMock.mockReset();
  });

  it("analyzeAuthenticatedCv falha: retorna erro sem tocar poll/save", async () => {
    analyzeAuthenticatedCvMock.mockResolvedValue({ ok: false, error: "boom" });

    const result = await runAuthenticatedAnalysisFlow({
      formData: buildFormData(),
      inputMode: "file_upload",
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({ kind: "error", error: "boom" });
    expect(pollAnalysisJobMock).not.toHaveBeenCalled();
    expect(saveGuestPreviewMock).not.toHaveBeenCalled();
  });

  it("poll falha: retorna erro sem salvar", async () => {
    analyzeAuthenticatedCvMock.mockResolvedValue({ ok: true, jobId: "job-1" });
    pollAnalysisJobMock.mockResolvedValue({ ok: false, error: "timeout" });

    const result = await runAuthenticatedAnalysisFlow({
      formData: buildFormData(),
      inputMode: "text_paste",
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({ kind: "error", error: "timeout" });
    expect(saveGuestPreviewMock).not.toHaveBeenCalled();
  });

  it("sucesso: materializa a CvAdaptation e retorna destino direto do resultado, sem gate/claim", async () => {
    analyzeAuthenticatedCvMock.mockResolvedValue({ ok: true, jobId: "job-2" });
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      masterCvText: "cv",
      analysisCvSnapshotId: "snapshot-1",
      jobTitle: null,
      companyName: null,
    });
    saveGuestPreviewMock.mockResolvedValue({ id: "adaptation-1" });

    const result = await runAuthenticatedAnalysisFlow({
      formData: buildFormData(),
      inputMode: "file_upload",
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result).toEqual({
      kind: "revealed",
      destination: "/adaptar/resultado?adaptationId=adaptation-1",
    });
    expect(analyzeAuthenticatedCvMock).toHaveBeenCalledWith(
      expect.any(FormData),
      "file_upload",
      JOURNEY_CONTEXT,
    );
    const saveArgs = saveGuestPreviewMock.mock.calls[0][0];
    expect(saveArgs.analysisCvSnapshotId).toBe("snapshot-1");
    expect(saveArgs.jobTitle).toBe("Analista");
    expect(saveArgs.companyName).toBe("Acme");
  });

  it("save falha: retorna erro em vez de propagar exceção", async () => {
    analyzeAuthenticatedCvMock.mockResolvedValue({ ok: true, jobId: "job-3" });
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: {},
      previewText: "preview",
      masterCvText: "cv",
      analysisCvSnapshotId: "snapshot-2",
      jobTitle: null,
      companyName: null,
    });
    saveGuestPreviewMock.mockRejectedValue(new Error("save failed"));

    const result = await runAuthenticatedAnalysisFlow({
      formData: buildFormData(),
      inputMode: "text_paste",
      journeyContext: JOURNEY_CONTEXT,
    });

    expect(result.kind).toBe("error");
  });
});
