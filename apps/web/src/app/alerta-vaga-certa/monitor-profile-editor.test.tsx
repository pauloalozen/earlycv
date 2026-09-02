import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonitorProfile } from "@/lib/monitor-api";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  updateMonitorProfile: vi.fn(),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: mocks.trackEvent,
}));
vi.mock("@/lib/monitor-api", () => ({
  updateMonitorProfile: mocks.updateMonitorProfile,
}));

import { MonitorProfileEditor } from "./monitor-profile-editor";

function buildProfile(overrides: Partial<MonitorProfile> = {}): MonitorProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    areas: ["DATA_AI"],
    seniority: "SENIOR",
    skills: ["python"],
    technologies: [],
    languages: [],
    certifications: [],
    preferredWorkModels: ["remote"],
    preferredContractTypes: ["PJ"],
    openToRelocation: false,
    salaryExpectationMin: null,
    sourceResumeId: null,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    monitorStatus: "ACTIVE",
    lastMatchedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MonitorProfileEditor", () => {
  beforeEach(() => {
    mocks.trackEvent.mockReset().mockResolvedValue(undefined);
    mocks.updateMonitorProfile.mockReset();
  });

  afterEach(() => cleanup());

  it("renders nothing when closed", () => {
    render(
      <MonitorProfileEditor
        open={false}
        profile={buildProfile()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.queryByText("Editar monitoramento")).not.toBeInTheDocument();
  });

  it("emits monitor_profile_viewed when opened", () => {
    render(
      <MonitorProfileEditor
        open
        profile={buildProfile()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent.mock.calls[0][0].eventName).toBe(
      "monitor_profile_viewed",
    );
  });

  it("pre-selects the current areas/seniority/work models/contract types from the profile", () => {
    render(
      <MonitorProfileEditor
        open
        profile={buildProfile()}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Dados & IA" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "sênior" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Remoto" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "PJ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("saving calls updateMonitorProfile with the edited selection and bubbles the updated profile up", async () => {
    const updated = buildProfile({ areas: ["DATA_AI", "PRODUCT"] });
    mocks.updateMonitorProfile.mockResolvedValue(updated);
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <MonitorProfileEditor
        open
        profile={buildProfile()}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Produto" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Salvar monitoramento" }),
    );

    await screen.findByText("Salvar monitoramento");

    expect(mocks.updateMonitorProfile).toHaveBeenCalledWith({
      areas: ["DATA_AI", "PRODUCT"],
      seniority: "SENIOR",
      preferredWorkModels: ["remote"],
      preferredContractTypes: ["PJ"],
    });
    expect(onSaved).toHaveBeenCalledWith(updated);
    expect(onClose).toHaveBeenCalled();
  });

  it("shows an error and does not close when saving fails", async () => {
    mocks.updateMonitorProfile.mockResolvedValue(null);
    const onClose = vi.fn();

    render(
      <MonitorProfileEditor
        open
        profile={buildProfile()}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Salvar monitoramento" }),
    );

    expect(
      await screen.findByText(
        "Não deu pra salvar agora. Tenta de novo em instantes.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("skills are shown as read-only context, not as editable inputs", () => {
    render(
      <MonitorProfileEditor
        open
        profile={buildProfile({ skills: ["python", "sql"] })}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    expect(screen.getByText("python")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Skills e idiomas vêm direto do seu CV e não são editáveis por aqui.",
      ),
    ).toBeInTheDocument();
  });
});
