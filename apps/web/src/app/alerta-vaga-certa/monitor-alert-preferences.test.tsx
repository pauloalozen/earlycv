import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonitorAlertPreference } from "@/lib/monitor-api";

const mocks = vi.hoisted(() => ({
  updateMonitorAlertPreferences: vi.fn(),
}));

vi.mock("@/lib/monitor-api", () => ({
  updateMonitorAlertPreferences: mocks.updateMonitorAlertPreferences,
}));

import { MonitorAlertPreferences } from "./monitor-alert-preferences";

function buildPreference(
  overrides: Partial<MonitorAlertPreference> = {},
): MonitorAlertPreference {
  return {
    userId: "user-1",
    emailEnabled: true,
    frequency: "DAILY",
    unsubscribedAt: null,
    ...overrides,
  };
}

describe("MonitorAlertPreferences", () => {
  beforeEach(() => {
    mocks.updateMonitorAlertPreferences.mockReset();
  });

  afterEach(() => cleanup());

  it("renders nothing when there is no preference to show", () => {
    const { container } = render(
      <MonitorAlertPreferences initialPreference={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the current frequency and marks the matching chip as pressed", () => {
    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ frequency: "WEEKLY" })}
      />,
    );

    expect(
      screen.getByText("Semanalmente", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Semanalmente" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Diariamente" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows E-mail as Desativado when frequency is OFF", () => {
    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ frequency: "OFF" })}
      />,
    );

    expect(
      screen.getAllByText("Desativado", { selector: "strong" }).length,
    ).toBeGreaterThan(0);
  });

  it("clicking a different frequency applies it optimistically and persists via updateMonitorAlertPreferences", async () => {
    mocks.updateMonitorAlertPreferences.mockResolvedValue(
      buildPreference({ frequency: "WEEKLY" }),
    );

    render(<MonitorAlertPreferences initialPreference={buildPreference()} />);

    fireEvent.click(screen.getByRole("button", { name: "Semanalmente" }));

    expect(
      screen.getByRole("button", { name: "Semanalmente" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(mocks.updateMonitorAlertPreferences).toHaveBeenCalledWith({
      frequency: "WEEKLY",
    });
  });

  it("reverts the optimistic update when the API call fails", async () => {
    mocks.updateMonitorAlertPreferences.mockResolvedValue(null);

    render(<MonitorAlertPreferences initialPreference={buildPreference()} />);

    fireEvent.click(screen.getByRole("button", { name: "Desativado" }));

    expect(
      await screen.findByText("Diariamente", { selector: "strong" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Diariamente" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("clicking the already-active frequency does not call the API again", () => {
    render(<MonitorAlertPreferences initialPreference={buildPreference()} />);

    fireEvent.click(screen.getByRole("button", { name: "Diariamente" }));

    expect(mocks.updateMonitorAlertPreferences).not.toHaveBeenCalled();
  });
});
