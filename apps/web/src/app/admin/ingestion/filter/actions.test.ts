import { afterEach, describe, expect, it, vi } from "vitest";

const createSemanticFilterConfigVersionMock = vi.hoisted(() => vi.fn());
const reenrichJobMock = vi.hoisted(() => vi.fn());
const runEnrichmentNowForJobMock = vi.hoisted(() => vi.fn());
const forceRunEnrichmentNowForJobMock = vi.hoisted(() => vi.fn());
const whitelistCrawlerDiscardMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin-semantic-filter-api", () => ({
  createSemanticFilterConfigVersion: createSemanticFilterConfigVersionMock,
  forceRunEnrichmentNowForJob: forceRunEnrichmentNowForJobMock,
  reenrichJob: reenrichJobMock,
  runEnrichmentNowForJob: runEnrichmentNowForJobMock,
}));

vi.mock("@/lib/admin-crawler-discards-api", () => ({
  whitelistCrawlerDiscard: whitelistCrawlerDiscardMock,
}));

import {
  enrichNowFormAction,
  forceEnrichFormAction,
  saveSemanticFilterConfigVersionAction,
  whitelistCrawlerDiscardAction,
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
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion");
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

  it("enrichNowFormAction resets the job and processes it specifically", async () => {
    const formData = new FormData();
    formData.set("jobEnrichmentId", "enrichment-1");

    await enrichNowFormAction(formData);

    expect(reenrichJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(runEnrichmentNowForJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion");
  });

  it("enrichNowFormAction no-ops without an id", async () => {
    const formData = new FormData();

    await enrichNowFormAction(formData);

    expect(reenrichJobMock).not.toHaveBeenCalled();
    expect(runEnrichmentNowForJobMock).not.toHaveBeenCalled();
  });

  it("forceEnrichFormAction resets the job and forces it past the semantic filter", async () => {
    const formData = new FormData();
    formData.set("jobEnrichmentId", "enrichment-1");

    await forceEnrichFormAction(formData);

    expect(reenrichJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(forceRunEnrichmentNowForJobMock).toHaveBeenCalledWith(
      "enrichment-1",
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion");
  });

  it("forceEnrichFormAction no-ops without an id", async () => {
    const formData = new FormData();

    await forceEnrichFormAction(formData);

    expect(reenrichJobMock).not.toHaveBeenCalled();
    expect(forceRunEnrichmentNowForJobMock).not.toHaveBeenCalled();
  });

  it("whitelistCrawlerDiscardAction adds term and revalidates", async () => {
    whitelistCrawlerDiscardMock.mockResolvedValueOnce({
      id: "config-2",
      version: "v2",
    });

    const formData = new FormData();
    formData.set("id", "discard-1");
    formData.set("term", "governanca de ti");

    const result = await whitelistCrawlerDiscardAction(null, formData);

    expect(whitelistCrawlerDiscardMock).toHaveBeenCalledWith(
      "discard-1",
      "governanca de ti",
    );
    expect(result.kind).toBe("success");
    expect(result.message).toMatch(/v2/);
    expect(revalidatePathMock).toHaveBeenCalledWith("/admin/ingestion");
  });

  it("whitelistCrawlerDiscardAction returns error when term is empty", async () => {
    const formData = new FormData();
    formData.set("id", "discard-1");
    formData.set("term", "  ");

    const result = await whitelistCrawlerDiscardAction(null, formData);

    expect(result.kind).toBe("error");
    expect(whitelistCrawlerDiscardMock).not.toHaveBeenCalled();
  });

  it("whitelistCrawlerDiscardAction returns error result when the API call fails", async () => {
    whitelistCrawlerDiscardMock.mockRejectedValueOnce(
      new Error("API 500: boom"),
    );

    const formData = new FormData();
    formData.set("id", "discard-1");
    formData.set("term", "governanca de ti");

    const result = await whitelistCrawlerDiscardAction(null, formData);

    expect(result.kind).toBe("error");
  });
});
