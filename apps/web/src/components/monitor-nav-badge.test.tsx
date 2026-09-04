import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMonitorCount: vi.fn(),
}));

vi.mock("@/lib/monitor-api", () => ({
  getMonitorCount: mocks.getMonitorCount,
}));

import { MonitorNavBadge } from "./monitor-nav-badge";

describe("MonitorNavBadge", () => {
  beforeEach(() => {
    mocks.getMonitorCount.mockReset();
  });

  afterEach(() => cleanup());

  it("renders nothing when disabled (unauthenticated), never fetching the count", () => {
    render(<MonitorNavBadge enabled={false} />);

    expect(mocks.getMonitorCount).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing when the count is 0", async () => {
    mocks.getMonitorCount.mockResolvedValue({
      count: 0,
      monitorStatus: "ACTIVE",
    });

    render(<MonitorNavBadge enabled />);

    await waitFor(() => expect(mocks.getMonitorCount).toHaveBeenCalled());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the count when greater than 0", async () => {
    mocks.getMonitorCount.mockResolvedValue({
      count: 4,
      monitorStatus: "ACTIVE",
    });

    render(<MonitorNavBadge enabled />);

    expect(await screen.findByRole("status")).toHaveTextContent("4");
  });

  it("caps the display at 9+", async () => {
    mocks.getMonitorCount.mockResolvedValue({
      count: 42,
      monitorStatus: "ACTIVE",
    });

    render(<MonitorNavBadge enabled />);

    expect(await screen.findByRole("status")).toHaveTextContent("9+");
  });
});
