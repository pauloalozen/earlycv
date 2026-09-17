import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  bulkToggleActiveAction: vi.fn(),
  bulkToggleScheduleEnabledAction: vi.fn(),
  deleteJobSourceAction: vi.fn(),
  importCompanySourcesCsvAction: vi.fn(),
  runJobSourceAction: vi.fn(),
  toggleActiveAction: vi.fn().mockResolvedValue(undefined),
  toggleScheduleEnabledAction: vi.fn(),
}));

import { toggleActiveAction } from "../actions";
import { FontesTableClient } from "./fontes-table-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const emptyResult = {
  page: 1,
  pageSize: 50,
  rows: [],
  total: 0,
  totalPages: 1,
};

describe("FontesTableClient — ação em massa por adapter", () => {
  // Os botões ficam sempre no DOM (posição fixa na barra de filtro) — só
  // desabilitados sem adapter selecionado. Isso evita clique indevido em
  // botão que "pulou" de lugar quando outro item da barra aparece/some.
  it("mantém os botões de ativar/desativar em massa desabilitados sem adapter selecionado", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<FontesTableClient initialData={emptyResult} />);

    expect(screen.getByText("Ativar agendamento")).toBeDisabled();
    expect(screen.getByText("Desativar agendamento")).toBeDisabled();
    expect(screen.getByText("Ativar fontes")).toBeDisabled();
    expect(screen.getByText("Desativar fontes")).toBeDisabled();
  });

  it("habilita os botões de ativar/desativar em massa quando um adapter é pré-selecionado via URL", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(
      <FontesTableClient initialData={emptyResult} initialTypeFilter="gupy" />,
    );

    expect(screen.getByText("Ativar agendamento (gupy)")).toBeEnabled();
    expect(screen.getByText("Desativar agendamento (gupy)")).toBeEnabled();
    expect(screen.getByText("Ativar fontes (gupy)")).toBeEnabled();
    expect(screen.getByText("Desativar fontes (gupy)")).toBeEnabled();
  });
});

describe("FontesTableClient — toggle de fonte ativa por linha", () => {
  const oneRowResult = {
    page: 1,
    pageSize: 50,
    rows: [
      {
        activeJobsCount: 0,
        company: { id: "c1", logoUrl: null, name: "Itaqui Energia" },
        createdAt: "2026-01-01T00:00:00.000Z",
        id: "js1",
        isActive: true,
        sourceName: "Itaqui Energia careers",
        sourceType: "gupy",
      },
    ],
    total: 1,
    totalPages: 1,
  };

  it("desativa a fonte direto na listagem, sem pedir confirmação quando não há vaga ativa", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal("confirm", vi.fn());

    render(<FontesTableClient initialData={oneRowResult} />);

    fireEvent.click(screen.getByTitle(/Desativar fonte/));

    expect(window.confirm).not.toHaveBeenCalled();
    expect(toggleActiveAction).toHaveBeenCalledTimes(1);
    const sentFormData = vi.mocked(toggleActiveAction).mock.calls[0]?.[0];
    expect(sentFormData?.get("jobSourceId")).toBe("js1");
    expect(sentFormData?.get("isActive")).toBe("false");
  });

  it("pede confirmação antes de desativar quando a fonte tem vagas ativas", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));

    render(
      <FontesTableClient
        initialData={{
          ...oneRowResult,
          rows: [{ ...oneRowResult.rows[0], activeJobsCount: 6 }],
        }}
      />,
    );

    fireEvent.click(screen.getByTitle(/Desativar fonte/));

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(toggleActiveAction).not.toHaveBeenCalled();
  });
});
