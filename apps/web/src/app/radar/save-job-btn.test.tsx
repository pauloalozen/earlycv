import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  saveJob: vi.fn(),
  unsaveJob: vi.fn(),
  useRouter: vi.fn(),
  resolveJobProductOrigin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: mocks.useRouter }));
vi.mock("@/lib/saved-jobs-api", () => ({
  saveJob: mocks.saveJob,
  unsaveJob: mocks.unsaveJob,
}));
vi.mock("@/lib/journey-session", () => ({
  resolveJobProductOrigin: mocks.resolveJobProductOrigin,
}));

import { SaveJobTextBtn } from "./save-job-btn";

describe("SaveJobTextBtn — origin resolved from the navigation that brought the user to this job", () => {
  beforeEach(() => {
    mocks.saveJob.mockReset();
    mocks.saveJob.mockResolvedValue(true);
    mocks.unsaveJob.mockReset();
    mocks.useRouter.mockReturnValue({ push: vi.fn() });
    mocks.resolveJobProductOrigin.mockReset();
  });

  afterEach(() => cleanup());

  it("saves with origin=RADAR when the resolved product_origin is radar", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("radar");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "RADAR");
  });

  it("saves with origin=RADAR when the resolved product_origin is anything other than monitor/monitor_email (e.g. direct, seo_job)", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("seo_job");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "RADAR");
  });

  it("saves with origin=MONITOR when the resolved product_origin is monitor", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("monitor");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "MONITOR");
  });

  it("saves with origin=MONITOR when the resolved product_origin is monitor_email", async () => {
    mocks.resolveJobProductOrigin.mockReturnValue("monitor_email");
    render(<SaveJobTextBtn jobId="job-1" />);

    fireEvent.click(screen.getByText("salvar para depois"));

    expect(mocks.saveJob).toHaveBeenCalledWith("job-1", "MONITOR");
  });

  it("resolves the origin scoped to its own jobId", () => {
    mocks.resolveJobProductOrigin.mockReturnValue("radar");
    render(<SaveJobTextBtn jobId="job-42" />);

    expect(mocks.resolveJobProductOrigin).toHaveBeenCalledWith("job-42");
  });
});
