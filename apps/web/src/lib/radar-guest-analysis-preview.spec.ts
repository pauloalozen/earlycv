import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollRadarAnalysisPreview } from "./radar-guest-analysis-preview";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true) {
  return {
    ok,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

describe("pollRadarAnalysisPreview", () => {
  it("resolve imediatamente quando o job já está succeeded, sem esperar o intervalo de poll", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados Jr",
        companyName: "Stefanini",
        score: { before: 68, after: 82 },
        breakdown: [
          { dimension: "skill", label: "Skills técnicas", coveragePercent: 75 },
        ],
        gapsCount: 2,
      }),
    );

    const result = await pollRadarAnalysisPreview("job-1", "token-1");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.status).toBe("succeeded");
      expect(result.preview.score).toEqual({ before: 68, after: 82 });
    }
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cv-adaptation/analysis-jobs/job-1/radar-preview",
      expect.objectContaining({
        headers: { "x-guest-possession-token": "token-1" },
      }),
    );
  });

  it("continua fazendo poll enquanto o status for pending/processing, até succeeded", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ status: "pending" }))
      .mockResolvedValueOnce(jsonResponse({ status: "processing" }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: "succeeded",
          lastError: null,
          jobTitle: null,
          companyName: null,
          score: { before: 50, after: 70 },
          breakdown: null,
          gapsCount: null,
        }),
      );

    const promise = pollRadarAnalysisPreview("job-2", "token-2");
    await vi.advanceTimersByTimeAsync(3000);
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });

  it("status failed: retorna erro com lastError", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "failed", lastError: "boom" }),
    );

    const result = await pollRadarAnalysisPreview("job-3", "token-3");

    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("resposta HTTP não-ok: retorna erro sem lançar exceção", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ message: "analysis job not found" }, false),
    );

    const result = await pollRadarAnalysisPreview("job-4", "wrong-token");

    expect(result.ok).toBe(false);
  });
});
