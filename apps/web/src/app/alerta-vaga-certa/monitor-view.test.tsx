import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  MonitorNotificationsFeed,
  MonitorProfile,
  MonitorRecommendationItem,
} from "@/lib/monitor-api";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  listMonitorNotifications: vi.fn(),
  getMonitorProfile: vi.fn(),
  dismissRecommendation: vi.fn(),
  markRecommendationViewed: vi.fn(),
  submitRecommendationFeedback: vi.fn(),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: mocks.trackEvent,
}));
vi.mock("@/lib/monitor-api", () => ({
  listMonitorNotifications: mocks.listMonitorNotifications,
  getMonitorProfile: mocks.getMonitorProfile,
  dismissRecommendation: mocks.dismissRecommendation,
  markRecommendationViewed: mocks.markRecommendationViewed,
  submitRecommendationFeedback: mocks.submitRecommendationFeedback,
}));
// Testado à parte (monitor-notification-group.test.tsx) — aqui só
// verificamos que MonitorView repassa os grupos/bucket certos.
vi.mock("./monitor-notification-group", () => ({
  MonitorNotificationGroup: ({
    variant,
    items,
  }: {
    variant: "pending" | "sent";
    items: { recommendationId: string }[];
  }) => (
    <div data-testid={`group-${variant}`}>
      {variant} · {items.length} itens
    </div>
  ),
}));
vi.mock("./monitor-grid-styles", () => ({ MonitorGridStyles: () => null }));
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

function buildItem(id: string): MonitorRecommendationItem {
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
    job: { id, title: `Vaga ${id}` } as never,
  };
}

function buildFeed(
  overrides: Partial<MonitorNotificationsFeed> = {},
): MonitorNotificationsFeed {
  return {
    pending: null,
    groups: [],
    page: 1,
    limit: 10,
    totalGroups: 0,
    hasMore: false,
    nextPage: null,
    monitorStatus: "ACTIVE",
    ...overrides,
  };
}

describe("MonitorView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.trackEvent.mockReset().mockResolvedValue(undefined);
    mocks.listMonitorNotifications.mockReset();
    mocks.getMonitorProfile.mockReset();
    mocks.dismissRecommendation.mockReset().mockResolvedValue(true);
    mocks.markRecommendationViewed.mockReset().mockResolvedValue(true);
    mocks.submitRecommendationFeedback.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("emits monitor_view once on mount", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed()}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent.mock.calls[0][0].eventName).toBe("monitor_view");
  });

  it("INITIALIZING: shows 'Estamos preparando seu Alerta de Vaga Certa', not a generic empty state", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed({ monitorStatus: "INITIALIZING" })}
        initialMonitorStatus="INITIALIZING"
        initialProfile={buildProfile({ monitorStatus: "INITIALIZING" })}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Estamos preparando seu Alerta de Vaga Certa"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("SEU ALERTA DE VAGA CERTA ESTÁ ATIVO"),
    ).not.toBeInTheDocument();
  });

  it("ACTIVE with pending and sent groups: renders both named sections", () => {
    const feed = buildFeed({
      pending: { items: [buildItem("rec-1")], total: 1, hasMore: false },
      groups: [
        {
          digestId: "digest-1",
          sentAt: new Date().toISOString(),
          frequency: "DAILY",
          items: [buildItem("rec-2"), buildItem("rec-3")],
          total: 2,
        },
      ],
      totalGroups: 1,
    });
    render(
      <MonitorView
        initialNotifications={feed}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(screen.getByTestId("group-pending")).toHaveTextContent(
      "pending · 1 itens",
    );
    expect(screen.getByText("ALERTAS ENVIADOS")).toBeInTheDocument();
    expect(screen.getByTestId("group-sent")).toHaveTextContent(
      "sent · 2 itens",
    );
  });

  it("ACTIVE with nothing pending or sent: shows the valid-empty-state copy, never a generic empty state or Radar listing", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed()}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("SEU ALERTA DE VAGA CERTA ESTÁ ATIVO"),
    ).toBeInTheDocument();
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

  it("with only a pending bucket (no digest sent yet): shows the pending section without the 'Alertas enviados' title", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed({
          pending: { items: [buildItem("rec-1")], total: 1, hasMore: false },
        })}
        initialMonitorStatus="ACTIVE"
        initialProfile={buildProfile()}
        initialAlertPreference={null}
      />,
    );

    expect(screen.getByTestId("group-pending")).toBeInTheDocument();
    expect(screen.queryByText("ALERTAS ENVIADOS")).not.toBeInTheDocument();
  });

  it("REFRESHING: keeps showing existing groups and adds a discreet banner, never blanking the screen", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed({
          monitorStatus: "REFRESHING",
          groups: [
            {
              digestId: "digest-1",
              sentAt: new Date().toISOString(),
              frequency: "DAILY",
              items: [buildItem("rec-1")],
              total: 1,
            },
          ],
          totalGroups: 1,
        })}
        initialMonitorStatus="REFRESHING"
        initialProfile={buildProfile({ monitorStatus: "REFRESHING" })}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Atualizando oportunidades com seu novo perfil"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("group-sent")).toBeInTheDocument();
  });

  it("without a UserRadarProfile, prompts to upload a CV instead of rendering an empty screen", () => {
    render(
      <MonitorView
        initialNotifications={buildFeed()}
        initialMonitorStatus="ACTIVE"
        initialProfile={null}
        initialAlertPreference={null}
      />,
    );

    expect(
      screen.getByText("Seu Alerta de Vaga Certa ainda não foi configurado"),
    ).toBeInTheDocument();
  });

  it("polls notifications while status is not ACTIVE and stops once it becomes ACTIVE", async () => {
    mocks.listMonitorNotifications.mockResolvedValue(
      buildFeed({
        groups: [
          {
            digestId: "digest-1",
            sentAt: new Date().toISOString(),
            frequency: "DAILY",
            items: [buildItem("rec-1")],
            total: 1,
          },
        ],
        totalGroups: 1,
      }),
    );

    render(
      <MonitorView
        initialNotifications={buildFeed({ monitorStatus: "INITIALIZING" })}
        initialMonitorStatus="INITIALIZING"
        initialProfile={buildProfile({ monitorStatus: "INITIALIZING" })}
        initialAlertPreference={null}
      />,
    );

    expect(mocks.listMonitorNotifications).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(mocks.listMonitorNotifications).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(8_000);
    // Já virou ACTIVE na primeira leitura — não deve continuar pollando.
    expect(mocks.listMonitorNotifications).toHaveBeenCalledTimes(1);
  });
});
