import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonitorProfile } from "@/lib/monitor-api";
import type { MonitorLevelSectionData } from "./monitor-view";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  listMonitorRecommendations: vi.fn(),
  getMonitorLevelCounts: vi.fn(),
  getMonitorCount: vi.fn(),
  getMonitorProfile: vi.fn(),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: mocks.trackEvent,
}));
vi.mock("@/lib/monitor-api", () => ({
  listMonitorRecommendations: mocks.listMonitorRecommendations,
  getMonitorLevelCounts: mocks.getMonitorLevelCounts,
  getMonitorCount: mocks.getMonitorCount,
  getMonitorProfile: mocks.getMonitorProfile,
}));
// Testado à parte (monitor-level-section.test.tsx) — aqui só verificamos
// que MonitorView repassa as seções certas pra cada nível.
vi.mock("./monitor-level-section", () => ({
  MonitorLevelSection: ({
    level,
    initialItems,
  }: {
    level: number;
    initialItems: { recommendationId: string }[];
  }) => (
    <div data-testid="level-section">
      nível {level} · {initialItems.length} itens
    </div>
  ),
  MonitorGridStyles: () => null,
}));
vi.mock("./monitor-profile-editor", () => ({
  MonitorProfileEditor: ({ open }: { open: boolean }) =>
    open ? <div data-testid="profile-editor">editor</div> : null,
}));
vi.mock("./monitor-alert-preferences", () => ({
  MonitorAlertPreferences: () => null,
}));

import { MonitorView } from "./monitor-view";

function buildProfile(overrides: Partial<MonitorProfile> = {}): MonitorProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    areas: ["DATA_AI"],
    seniority: "SENIOR",
    skills: ["python", "sql"],
    technologies: ["python"],
    languages: [],
    certifications: [],
    preferredWorkModels: ["remote"],
    preferredContractTypes: [],
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

function buildItem(id: string) {
  return {
    recommendationId: id,
    score: 80,
    opportunityLevel: 4,
    recommendedAt: new Date().toISOString(),
    viewedAt: null,
    dismissedAt: null,
    isNew: true,
    feedback: null,
    feedbackReason: null,
    job: { id, title: `Vaga ${id}` },
  } as never;
}

const EMPTY_COUNTS = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

describe("MonitorView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.trackEvent.mockReset().mockResolvedValue(undefined);
    mocks.listMonitorRecommendations.mockReset();
    mocks.getMonitorLevelCounts.mockReset().mockResolvedValue(EMPTY_COUNTS);
    mocks.getMonitorCount
      .mockReset()
      .mockResolvedValue({ count: 0, monitorStatus: "ACTIVE" });
    mocks.getMonitorProfile.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("emits monitor_view once on mount", () => {
    render(
      <MonitorView
        initialSections={[]}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent.mock.calls[0][0].eventName).toBe("monitor_view");
  });

  it("INITIALIZING: shows 'Estamos preparando seu Monitor', not a generic empty state", () => {
    render(
      <MonitorView
        initialSections={[]}
        initialMonitorStatus="INITIALIZING"
        initialProfile={buildProfile({ monitorStatus: "INITIALIZING" })}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Estamos preparando seu Monitor"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Seu Monitor está ativo"),
    ).not.toBeInTheDocument();
  });

  it("ACTIVE with results: renders one section per opportunity level with itens", () => {
    const sections: MonitorLevelSectionData[] = [
      { level: 5, items: [buildItem("rec-1")], total: 1 },
      { level: 4, items: [buildItem("rec-2"), buildItem("rec-3")], total: 2 },
    ];
    render(
      <MonitorView
        initialSections={sections}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    const rendered = screen.getAllByTestId("level-section");
    expect(rendered).toHaveLength(2);
    expect(rendered[0]).toHaveTextContent("nível 5 · 1 itens");
    expect(rendered[1]).toHaveTextContent("nível 4 · 2 itens");
  });

  it("ACTIVE with no results: shows the valid-empty-state copy, with both CTAs, never a generic empty state or Radar listing", () => {
    render(
      <MonitorView
        initialSections={[]}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(screen.getByText("SEU MONITOR ESTÁ ATIVO")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ainda não encontramos novas vagas dentro dos critérios definidos.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Revisar meu monitoramento")).toBeInTheDocument();
    expect(
      screen.getByText("Explorar Radar de Oportunidades →"),
    ).toBeInTheDocument();
  });

  it("REFRESHING: keeps showing existing sections and adds a discreet banner, never blanking the screen", () => {
    render(
      <MonitorView
        initialSections={[{ level: 4, items: [buildItem("rec-1")], total: 1 }]}
        initialMonitorStatus="REFRESHING"
        initialProfile={buildProfile({ monitorStatus: "REFRESHING" })}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Atualizando oportunidades com seu novo perfil"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("level-section")).toBeInTheDocument();
  });

  it("without a UserRadarProfile, prompts to upload a CV instead of rendering an empty Monitor", () => {
    render(
      <MonitorView
        initialSections={[]}
        initialMonitorStatus="ACTIVE"
        initialProfile={null}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Seu Monitor ainda não foi configurado"),
    ).toBeInTheDocument();
  });

  it("polls level counts while status is not ACTIVE and stops once it becomes ACTIVE", async () => {
    mocks.getMonitorLevelCounts.mockResolvedValue({ ...EMPTY_COUNTS, 4: 1 });
    mocks.getMonitorCount.mockResolvedValue({
      count: 1,
      monitorStatus: "ACTIVE",
    });
    mocks.listMonitorRecommendations.mockResolvedValue({
      items: [buildItem("rec-1")],
      total: 1,
      page: 1,
      limit: 4,
      monitorStatus: "ACTIVE",
    });

    render(
      <MonitorView
        initialSections={[]}
        initialMonitorStatus="INITIALIZING"
        initialProfile={buildProfile({ monitorStatus: "INITIALIZING" })}
        initialAlertPreference={null}
      />,
    );

    expect(mocks.getMonitorLevelCounts).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mocks.getMonitorLevelCounts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8_000);
    // Já virou ACTIVE na primeira leitura — não deve continuar pollando.
    expect(mocks.getMonitorLevelCounts).toHaveBeenCalledTimes(1);
  });
});
