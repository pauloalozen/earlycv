import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analyzeAuthenticatedCvMock = vi.hoisted(() => vi.fn());
const saveGuestPreviewMock = vi.hoisted(() => vi.fn());
const pollAnalysisJobMock = vi.hoisted(() => vi.fn());
const getJourneySessionInternalIdMock = vi.hoisted(() => vi.fn());
const getOrCreateVisitorIdMock = vi.hoisted(() => vi.fn());

vi.mock("./cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: analyzeAuthenticatedCvMock,
  saveGuestPreview: saveGuestPreviewMock,
}));

vi.mock("./analysis-job-polling", () => ({
  pollAnalysisJob: pollAnalysisJobMock,
}));

vi.mock("./journey-session", () => ({
  getJourneySessionInternalId: getJourneySessionInternalIdMock,
}));

vi.mock("./visitor-id", () => ({
  getOrCreateVisitorId: getOrCreateVisitorIdMock,
}));

import { analyzeMasterCvForJob } from "./analyze-master-cv-flow";

describe("analyzeMasterCvForJob — Radar 1-click analysis (bypasses /adaptar)", () => {
  beforeEach(() => {
    analyzeAuthenticatedCvMock.mockReset();
    saveGuestPreviewMock.mockReset();
    pollAnalysisJobMock.mockReset();
    getJourneySessionInternalIdMock.mockReset();
    getOrCreateVisitorIdMock.mockReset();

    getJourneySessionInternalIdMock.mockReturnValue("journey-radar-1");
    getOrCreateVisitorIdMock.mockReturnValue("visitor-radar-1");
    analyzeAuthenticatedCvMock.mockResolvedValue({
      ok: true,
      jobId: "job-radar-1",
      guestSessionPublicToken: null,
    });
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      masterCvText: "master-cv",
      analysisCvSnapshotId: "snapshot-radar-1",
    });
    saveGuestPreviewMock.mockResolvedValue({ id: "adaptation-radar-1" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("propagates sessionInternalId/visitorId (read client-side) to analyzeAuthenticatedCv, same as /adaptar — the Server Action has no storage access on its own", async () => {
    await analyzeMasterCvForJob({
      masterResumeId: "resume-1",
      radarJobId: "job-abc",
      jobDescriptionText: "Descricao da vaga",
      turnstileToken: "token-1",
    });

    expect(analyzeAuthenticatedCvMock.mock.calls[0]?.[2]).toEqual({
      sessionInternalId: "journey-radar-1",
      visitorId: "visitor-radar-1",
    });
  });

  it("propagates the same sessionInternalId/visitorId to saveGuestPreview (automatic candidatura_created) as to analyzeAuthenticatedCv", async () => {
    await analyzeMasterCvForJob({
      masterResumeId: "resume-1",
      radarJobId: "job-abc",
      jobDescriptionText: "Descricao da vaga",
      turnstileToken: "token-1",
    });

    const analyzeContext = analyzeAuthenticatedCvMock.mock.calls[0]?.[2];
    const saveCall = saveGuestPreviewMock.mock.calls[0]?.[0];

    expect(saveCall).toMatchObject({
      sessionInternalId: "journey-radar-1",
      visitorId: "visitor-radar-1",
      radarJobId: "job-abc",
    });
    expect(saveCall.sessionInternalId).toBe(analyzeContext.sessionInternalId);
    expect(saveCall.visitorId).toBe(analyzeContext.visitorId);
  });

  it("still forwards masterResumeId/radarJobId/turnstileToken in the FormData sent to analyzeAuthenticatedCv", async () => {
    await analyzeMasterCvForJob({
      masterResumeId: "resume-9",
      radarJobId: "job-xyz",
      jobDescriptionText: "Descricao",
      turnstileToken: "token-9",
    });

    const formData = analyzeAuthenticatedCvMock.mock.calls[0]?.[0] as FormData;
    expect(formData.get("masterResumeId")).toBe("resume-9");
    expect(formData.get("radarJobId")).toBe("job-xyz");
    expect(formData.get("turnstileToken")).toBe("token-9");
  });

  it("prioritizes the radar-curated jobTitle/companyName over what the AI extracted into adaptedContentJson.vaga", async () => {
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: { vaga: { cargo: "Não informado", empresa: "" } },
      previewText: "preview",
      masterCvText: "master-cv",
      analysisCvSnapshotId: "snapshot-radar-1",
      jobTitle: "Analista de Dados Sênior",
      companyName: "Nubank",
    });

    await analyzeMasterCvForJob({
      masterResumeId: "resume-1",
      radarJobId: "job-abc",
      jobDescriptionText: "Descricao da vaga",
      turnstileToken: "token-1",
    });

    expect(saveGuestPreviewMock.mock.calls[0]?.[0]).toMatchObject({
      jobTitle: "Analista de Dados Sênior",
      companyName: "Nubank",
    });
  });

  it("falls back to the AI-extracted vaga.cargo/empresa when the job has no curated jobTitle/companyName (non-radar analysis)", async () => {
    pollAnalysisJobMock.mockResolvedValue({
      ok: true,
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      masterCvText: "master-cv",
      analysisCvSnapshotId: "snapshot-radar-1",
      jobTitle: null,
      companyName: null,
    });

    await analyzeMasterCvForJob({
      masterResumeId: "resume-1",
      radarJobId: "job-abc",
      jobDescriptionText: "Descricao da vaga",
      turnstileToken: "token-1",
    });

    expect(saveGuestPreviewMock.mock.calls[0]?.[0]).toMatchObject({
      jobTitle: "Analista",
      companyName: "Acme",
    });
  });

  it("does not call saveGuestPreview when analyzeAuthenticatedCv fails", async () => {
    analyzeAuthenticatedCvMock.mockResolvedValue({
      ok: false,
      error: "boom",
    });

    const result = await analyzeMasterCvForJob({
      masterResumeId: "resume-1",
      radarJobId: "job-abc",
      jobDescriptionText: "Descricao",
      turnstileToken: "token-1",
    });

    expect(result).toEqual({ ok: false, error: "boom" });
    expect(saveGuestPreviewMock).not.toHaveBeenCalled();
  });
});
