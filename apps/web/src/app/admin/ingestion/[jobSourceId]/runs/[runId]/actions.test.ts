import { afterEach, describe, expect, it, vi } from "vitest";

const reenrichJobMock = vi.hoisted(() => vi.fn());
const runEnrichmentNowForJobMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

vi.mock("@/lib/admin-semantic-filter-api", () => ({
  reenrichJob: reenrichJobMock,
  runEnrichmentNowForJob: runEnrichmentNowForJobMock,
}));

import { enrichJobNowAction } from "./actions";

describe("run detail actions", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resets the job, processes it specifically and revalidates the run path", async () => {
    const formData = new FormData();
    formData.set("jobEnrichmentId", "enrichment-1");
    formData.set("jobSourceId", "source-1");
    formData.set("runId", "run-1");

    await enrichJobNowAction(formData);

    expect(reenrichJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(runEnrichmentNowForJobMock).toHaveBeenCalledWith("enrichment-1");
    expect(revalidatePathMock).toHaveBeenCalledWith(
      "/admin/ingestion/source-1/runs/run-1",
    );
  });

  it("no-ops when any required field is missing", async () => {
    const formData = new FormData();
    formData.set("jobEnrichmentId", "enrichment-1");

    await enrichJobNowAction(formData);

    expect(reenrichJobMock).not.toHaveBeenCalled();
    expect(runEnrichmentNowForJobMock).not.toHaveBeenCalled();
  });
});
