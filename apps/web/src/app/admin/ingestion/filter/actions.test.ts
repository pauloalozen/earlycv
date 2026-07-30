import { afterEach, describe, expect, it, vi } from "vitest";

const createSemanticFilterConfigVersionMock = vi.hoisted(() => vi.fn());
const reenrichJobMock = vi.hoisted(() => vi.fn());
const runEnrichmentNowMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin-semantic-filter-api", () => ({
  createSemanticFilterConfigVersion: createSemanticFilterConfigVersionMock,
  reenrichJob: reenrichJobMock,
  runEnrichmentNow: runEnrichmentNowMock,
}));

import {
  enrichNowFormAction,
  saveSemanticFilterConfigVersionAction,
} from "./actions";

describe("semantic filter actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("parses newline-separated signals and creates a new version", async () => {
    createSemanticFilterConfigVersionMock.mockResolvedValueOnce({
      version: "v2",
    });

    const formData = new FormData();
    formData.set("techSignals", "desenvolvedor\nengenheiro\n\n");
    formData.set("noiseSignals", "enfermeiro\nvendedor");
    formData.set("description", "  ajuste  ");

    const result = await saveSemanticFilterConfigVersionAction(null, formData);

    expect(createSemanticFilterConfigVersionMock).toHaveBeenCalledWith({
      description: "ajuste",
      noiseSignals: ["enfermeiro", "vendedor"],
      techSignals: ["desenvolvedor", "engenheiro"],
    });
    expect(result.kind).toBe("success");
    expect(result.message).toMatch(/v2/);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion/filter");
  });

  it("returns an error when techSignals or noiseSignals is empty", async () => {
    const formData = new FormData();
    formData.set("techSignals", "");
    formData.set("noiseSignals", "enfermeiro");

    const result = await saveSemanticFilterConfigVersionAction(null, formData);

    expect(result.kind).toBe("error");
    expect(createSemanticFilterConfigVersionMock).not.toHaveBeenCalled();
  });

  it("returns an error result when the API call fails", async () => {
    createSemanticFilterConfigVersionMock.mockRejectedValueOnce(
      new Error("API 500: boom"),
    );

    const formData = new FormData();
    formData.set("techSignals", "desenvolvedor");
    formData.set("noiseSignals", "enfermeiro");

    const result = await saveSemanticFilterConfigVersionAction(null, formData);

    expect(result.kind).toBe("error");
  });

  it("enrichNowFormAction resets the job and triggers run-now", async () => {
    const formData = new FormData();
    formData.set("jobEnrichmentId", "enrichment-1");

    await enrichNowFormAction(formData);

    expect(reenrichJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(runEnrichmentNowMock).toHaveBeenCalled();
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion/filter");
  });

  it("enrichNowFormAction no-ops without an id", async () => {
    const formData = new FormData();

    await enrichNowFormAction(formData);

    expect(reenrichJobMock).not.toHaveBeenCalled();
    expect(runEnrichmentNowMock).not.toHaveBeenCalled();
  });
});
