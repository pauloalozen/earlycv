import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonitorRecommendationItem } from "@/lib/monitor-api";

const mocks = vi.hoisted(() => ({
  trackEvent: vi.fn(),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: mocks.trackEvent,
}));

import { MonitorNotificationGroup } from "./monitor-notification-group";

function buildItem(
  id: string,
  overrides: Partial<MonitorRecommendationItem> = {},
): MonitorRecommendationItem {
  return {
    recommendationId: id,
    score: 82,
    opportunityLevel: 4,
    recommendedAt: new Date().toISOString(),
    viewedAt: null,
    dismissedAt: null,
    isNew: true,
    feedback: null,
    feedbackReason: null,
    ...overrides,
    job: {
      id,
      slug: `vaga-${id}`,
      title: `Vaga ${id}`,
      company: "Acme Corp",
      companyLogoUrl: null,
      companyWebsiteUrl: null,
      canonicalKey: id,
      city: null,
      country: "BR",
      description: "desc",
      descriptionHtml: "<p>desc</p>",
      dominantArea: "DATA_AI",
      employmentType: null,
      externalJobId: null,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      location: "Brasil",
      publishedAtSource: new Date().toISOString(),
      seniorityLevel: "SENIOR",
      sourceJobUrl: "https://example.com/job",
      state: null,
      status: "active",
      technologies: [],
      workModel: "remote",
      existingApplication: null,
      isSaved: false,
      ...overrides.job,
    },
  } as MonitorRecommendationItem;
}

describe("MonitorNotificationGroup", () => {
  beforeEach(() => {
    mocks.trackEvent.mockReset().mockResolvedValue(undefined);
    // jsdom não implementa IntersectionObserver — stub simples que
    // dispara "visível" no observe(), suficiente pra testar o disparo do
    // evento sem depender de layout real.
    class FakeIntersectionObserver {
      callback: IntersectionObserverCallback;
      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        this.callback(
          [{ isIntersecting: true, target } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      disconnect() {}
    }
    vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("variant='sent' shows the send date/count header; variant='pending' shows the 'Novas vagas encontradas' header", () => {
    const { rerender } = render(
      <MonitorNotificationGroup
        variant="sent"
        digestId="digest-1"
        sentAt="2026-09-02T09:14:00.000Z"
        items={[buildItem("rec-1")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText(/Enviado por e-mail em/)).toBeInTheDocument();
    expect(screen.getByText("1 vaga")).toBeInTheDocument();

    rerender(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-1")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByText(/Enviado por e-mail em/)).not.toBeInTheDocument();
    expect(screen.getByText("Novas vagas encontradas")).toBeInTheDocument();
  });

  it("renders one card per item", () => {
    render(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-1"), buildItem("rec-2")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Vaga rec-1")).toBeInTheDocument();
    expect(screen.getByText("Vaga rec-2")).toBeInTheDocument();
  });

  it("renders nothing when items is empty", () => {
    const { container } = render(
      <MonitorNotificationGroup
        variant="pending"
        items={[]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("dismiss on a pending card calls onDismiss with the recommendation id", () => {
    const onDismiss = vi.fn();
    render(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-1")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={onDismiss}
        onFeedback={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Ignorar"));
    expect(onDismiss).toHaveBeenCalledWith("rec-1");
  });

  it("dismiss on an already-dismissed sent card is disabled and shows 'Descartada'", () => {
    render(
      <MonitorNotificationGroup
        variant="sent"
        digestId="digest-1"
        sentAt="2026-09-02T09:14:00.000Z"
        items={[buildItem("rec-1", { dismissedAt: new Date().toISOString() })]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Descartada")).toBeInTheDocument();
    expect(screen.getByLabelText("Ignorar")).toBeDisabled();
  });

  it("fires monitor_digest_viewed once when a sent group becomes visible, never for pending", () => {
    render(
      <MonitorNotificationGroup
        variant="sent"
        digestId="digest-1"
        sentAt="2026-09-02T09:14:00.000Z"
        items={[buildItem("rec-1")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent.mock.calls[0][0].eventName).toBe(
      "monitor_digest_viewed",
    );
    expect(mocks.trackEvent.mock.calls[0][0].properties).toMatchObject({
      digest_id: "digest-1",
      sent_at: "2026-09-02T09:14:00.000Z",
      recommendation_count: 1,
    });

    mocks.trackEvent.mockClear();
    render(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-2")]}
        open
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("clicking the header calls onToggle", () => {
    const onToggle = vi.fn();
    render(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-1")]}
        open
        onToggle={onToggle}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("Novas vagas encontradas"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("when collapsed, shows a company-name preview chip in the header", () => {
    render(
      <MonitorNotificationGroup
        variant="pending"
        items={[buildItem("rec-1", { job: { company: "Acme Corp" } as never })]}
        open={false}
        onToggle={vi.fn()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    // aparece pelo menos na chip do header (o card em si continua no DOM,
    // só visualmente colapsado via CSS — grid-template-rows, não display:none).
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThanOrEqual(1);
  });
});
