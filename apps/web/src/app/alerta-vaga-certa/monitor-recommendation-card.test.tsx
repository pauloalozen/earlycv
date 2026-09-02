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

import { MonitorRecommendationCard } from "./monitor-recommendation-card";

function buildItem(
  overrides: Partial<MonitorRecommendationItem> = {},
): MonitorRecommendationItem {
  return {
    recommendationId: "rec-1",
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
      id: "job-1",
      slug: "vaga-empresa-job-1",
      title: "Engenheiro de Dados",
      company: "EarlyCV",
      companyLogoUrl: null,
      companyWebsiteUrl: null,
      canonicalKey: "job-1",
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
      technologies: ["Python"],
      workModel: "remote",
      existingApplication: null,
      isSaved: false,
      ...overrides.job,
    },
  } as MonitorRecommendationItem;
}

describe("MonitorRecommendationCard", () => {
  beforeEach(() => {
    mocks.trackEvent.mockReset();
    mocks.trackEvent.mockResolvedValue(undefined);
  });

  afterEach(() => cleanup());

  it("shows the 'Nova' badge only for isNew recommendations", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({ isNew: true })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Nova")).toBeInTheDocument();
  });

  it("does not show the 'Nova' badge for an already-viewed recommendation", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({ isNew: false })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.queryByText("Nova")).not.toBeInTheDocument();
  });

  it("shows title, company, location and the opportunity level label — never the raw score", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Engenheiro de Dados")).toBeInTheDocument();
    expect(screen.getByText("EarlyCV")).toBeInTheDocument();
    expect(screen.getByText("Muito aderente")).toBeInTheDocument();
    expect(screen.queryByText("82")).not.toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
  });

  it("links the title straight to the job detail page, with no separate adapt/apply CTA", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    const titleLink = screen.getByText("Engenheiro de Dados");
    expect(titleLink).toHaveAttribute("href", "/radar/vaga-empresa-job-1");
  });

  it("clicking the title marks viewed once and emits monitor_recommendation_clicked", () => {
    const onViewed = vi.fn();
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={onViewed}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Engenheiro de Dados"));

    expect(onViewed).toHaveBeenCalledTimes(1);
    expect(onViewed).toHaveBeenCalledWith("rec-1");
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent.mock.calls[0][0].eventName).toBe(
      "monitor_recommendation_clicked",
    );
  });

  it("clicking the title twice only marks viewed once (no duplicate firing per card)", () => {
    const onViewed = vi.fn();
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={onViewed}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("Engenheiro de Dados"));
    fireEvent.click(screen.getByText("Engenheiro de Dados"));

    expect(onViewed).toHaveBeenCalledTimes(1);
  });

  it("clicking dismiss calls onDismiss with the recommendation id", () => {
    const onDismiss = vi.fn();
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={vi.fn()}
        onDismiss={onDismiss}
        onFeedback={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Ignorar"));

    expect(onDismiss).toHaveBeenCalledWith("rec-1");
  });

  it("clicking the thumbs-up sends positive feedback with no reason", () => {
    const onFeedback = vi.fn();
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={onFeedback}
      />,
    );

    fireEvent.click(screen.getByLabelText("Achou isso pra você"));

    expect(onFeedback).toHaveBeenCalledWith("rec-1", "POSITIVE", undefined);
  });

  it("thumbs-down opens a reason menu, and picking one sends negative feedback with that reason", () => {
    const onFeedback = vi.fn();
    render(
      <MonitorRecommendationCard
        item={buildItem()}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={onFeedback}
      />,
    );

    fireEvent.click(screen.getByLabelText("Não é pra mim"));
    fireEvent.click(screen.getByText("Área errada"));

    expect(onFeedback).toHaveBeenCalledWith(
      "rec-1",
      "NEGATIVE",
      "AREA_MISMATCH",
    );
  });

  it("shows a status badge (e.g. 'Candidatado') when the job already has a JobApplication", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({
          job: { existingApplication: { id: "app-1", status: "APPLIED", bestScore: 80 } } as never,
        })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Candidatado")).toBeInTheDocument();
  });

  it("shows 'Salva' when the job is saved but has no JobApplication", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({ job: { isSaved: true } as never })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Salva")).toBeInTheDocument();
  });

  it("shows 'Descartada' when dismissed and there is no JobApplication, and disables the dismiss button", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({ dismissedAt: new Date().toISOString() })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Descartada")).toBeInTheDocument();
    expect(screen.getByLabelText("Ignorar")).toBeDisabled();
  });

  it("prioritizes a real JobApplication status over 'Descartada' (applied after having been dismissed)", () => {
    render(
      <MonitorRecommendationCard
        item={buildItem({
          dismissedAt: new Date().toISOString(),
          job: { existingApplication: { id: "app-1", status: "APPLIED", bestScore: 80 } } as never,
        })}
        onViewed={vi.fn()}
        onDismiss={vi.fn()}
        onFeedback={vi.fn()}
      />,
    );
    expect(screen.getByText("Candidatado")).toBeInTheDocument();
    expect(screen.queryByText("Descartada")).not.toBeInTheDocument();
  });
});
