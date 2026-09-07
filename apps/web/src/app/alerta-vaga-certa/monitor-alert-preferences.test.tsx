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

  it("shows Ativado when emailEnabled is true", () => {
    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ emailEnabled: true })}
      />,
    );

    const button = screen.getByRole("button", { name: "Ativado" });
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("shows Desativado when emailEnabled is false", () => {
    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ emailEnabled: false })}
      />,
    );

    const button = screen.getByRole("button", { name: "Desativado" });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking the toggle applies it optimistically and persists via updateMonitorAlertPreferences", async () => {
    mocks.updateMonitorAlertPreferences.mockResolvedValue(
      buildPreference({ emailEnabled: false }),
    );

    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ emailEnabled: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ativado" }));

    expect(
      await screen.findByRole("button", { name: "Desativado" }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(mocks.updateMonitorAlertPreferences).toHaveBeenCalledWith({
      emailEnabled: false,
    });
  });

  it("reverts the optimistic update when the API call fails", async () => {
    mocks.updateMonitorAlertPreferences.mockResolvedValue(null);

    render(
      <MonitorAlertPreferences
        initialPreference={buildPreference({ emailEnabled: true })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Ativado" }));

    expect(
      await screen.findByRole("button", { name: "Ativado" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
