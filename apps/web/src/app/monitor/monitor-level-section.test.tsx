import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MonitorRecommendationItem } from "@/lib/monitor-api";

const mocks = vi.hoisted(() => ({
  listMonitorRecommendations: vi.fn(),
  markRecommendationViewed: vi.fn(),
  dismissRecommendation: vi.fn(),
  submitRecommendationFeedback: vi.fn(),
}));

vi.mock("@/lib/monitor-api", () => ({
  listMonitorRecommendations: mocks.listMonitorRecommendations,
  markRecommendationViewed: mocks.markRecommendationViewed,
  dismissRecommendation: mocks.dismissRecommendation,
  submitRecommendationFeedback: mocks.submitRecommendationFeedback,
}));

// Testado à parte (monitor-recommendation-card.test.tsx) — aqui só
// verificamos que a seção passa os itens certos e reage aos handlers.
vi.mock("./monitor-recommendation-card", () => ({
  MonitorRecommendationCard: ({
    item,
    onDismiss,
  }: {
    item: MonitorRecommendationItem;
    onDismiss: (id: string) => void;
  }) => (
    <div data-testid="rec-card">
      {item.job.title}
      <button type="button" onClick={() => onDismiss(item.recommendationId)}>
        dismiss-{item.recommendationId}
      </button>
    </div>
  ),
}));

import { MonitorLevelSection } from "./monitor-level-section";

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
    job: { id, title: `Vaga ${id}` },
  } as never;
}

describe("MonitorLevelSection", () => {
  beforeEach(() => {
    mocks.listMonitorRecommendations.mockReset();
    mocks.markRecommendationViewed.mockReset().mockResolvedValue(true);
    mocks.dismissRecommendation.mockReset().mockResolvedValue(true);
    mocks.submitRecommendationFeedback.mockReset().mockResolvedValue(true);
  });

  afterEach(() => cleanup());

  it("renders nothing when the level has no active recommendations", () => {
    const { container } = render(
      <MonitorLevelSection
        level={4}
        initialItems={[]}
        initialTotal={0}
        pageSize={4}
        sort="score"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the level label, count and range", () => {
    render(
      <MonitorLevelSection
        level={5}
        initialItems={[buildItem("rec-1"), buildItem("rec-2")]}
        initialTotal={2}
        pageSize={4}
        sort="score"
      />,
    );
    expect(screen.getByText("Excelente oportunidade")).toBeInTheDocument();
    expect(screen.getByText("1–2 de 2")).toBeInTheDocument();
    expect(screen.getAllByTestId("rec-card")).toHaveLength(2);
  });

  it("disables both page buttons when everything fits on one page", () => {
    render(
      <MonitorLevelSection
        level={4}
        initialItems={[buildItem("rec-1")]}
        initialTotal={1}
        pageSize={4}
        sort="score"
      />,
    );
    expect(
      screen.getByLabelText("Página anterior de Muito aderente"),
    ).toBeDisabled();
    expect(
      screen.getByLabelText("Próxima página de Muito aderente"),
    ).toBeDisabled();
  });

  it("clicking next fetches the next page for this level and updates the range", async () => {
    mocks.listMonitorRecommendations.mockResolvedValue({
      items: [buildItem("rec-5"), buildItem("rec-6")],
      total: 6,
      page: 2,
      limit: 4,
      monitorStatus: "ACTIVE",
    });

    render(
      <MonitorLevelSection
        level={3}
        initialItems={[
          buildItem("rec-1"),
          buildItem("rec-2"),
          buildItem("rec-3"),
          buildItem("rec-4"),
        ]}
        initialTotal={6}
        pageSize={4}
        sort="score"
      />,
    );

    fireEvent.click(screen.getByLabelText("Próxima página de Aderente"));

    expect(mocks.listMonitorRecommendations).toHaveBeenCalledWith(
      2,
      4,
      false,
      3,
      "score",
    );
    expect(await screen.findByText("5–6 de 6")).toBeInTheDocument();
    expect(screen.getByText("Vaga rec-5")).toBeInTheDocument();
  });

  it("does not collapse the section when a page fetch silently fails (empty feed with total 0), shows a retry instead", async () => {
    // listMonitorRecommendations engole erro de rede/API e devolve um feed
    // vazio (total: 0) — o mesmo formato de "não há mais nada nesse
    // nível". A seção nunca pode confiar cegamente nisso quando já tinha
    // vagas carregadas (bug real: sumia a seção inteira ao voltar de página
    // depois de uma falha transitória).
    mocks.listMonitorRecommendations.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 4,
      monitorStatus: "ACTIVE",
    });

    render(
      <MonitorLevelSection
        level={3}
        initialItems={[buildItem("rec-1"), buildItem("rec-2")]}
        initialTotal={6}
        pageSize={4}
        sort="score"
      />,
    );

    fireEvent.click(screen.getByLabelText("Próxima página de Aderente"));

    expect(
      await screen.findByText("Não foi possível carregar essas vagas agora."),
    ).toBeInTheDocument();
    // As vagas que já estavam na tela continuam lá — a seção não sumiu.
    expect(screen.getByText("Vaga rec-1")).toBeInTheDocument();
    expect(screen.getByText("1–4 de 6")).toBeInTheDocument();

    // Tentar de novo repete a MESMA página que falhou.
    mocks.listMonitorRecommendations.mockClear();
    mocks.listMonitorRecommendations.mockResolvedValue({
      items: [buildItem("rec-5"), buildItem("rec-6")],
      total: 6,
      page: 2,
      limit: 4,
      monitorStatus: "ACTIVE",
    });
    fireEvent.click(screen.getByText("Tentar de novo"));

    expect(mocks.listMonitorRecommendations).toHaveBeenCalledWith(
      2,
      4,
      false,
      3,
      "score",
    );
    expect(await screen.findByText("5–6 de 6")).toBeInTheDocument();
  });

  it("dismissing a card removes it from the list and decrements the total shown", () => {
    render(
      <MonitorLevelSection
        level={4}
        initialItems={[buildItem("rec-1"), buildItem("rec-2")]}
        initialTotal={2}
        pageSize={4}
        sort="score"
      />,
    );

    fireEvent.click(screen.getByText("dismiss-rec-1"));

    expect(mocks.dismissRecommendation).toHaveBeenCalledWith("rec-1");
    expect(screen.queryByText("Vaga rec-1")).not.toBeInTheDocument();
    expect(screen.getByText("1–1 de 1")).toBeInTheDocument();
  });
});
