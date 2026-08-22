import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  bulkToggleActiveAction: vi.fn(),
  bulkToggleScheduleEnabledAction: vi.fn(),
  deleteJobSourceAction: vi.fn(),
  importCompanySourcesCsvAction: vi.fn(),
  runJobSourceAction: vi.fn(),
  toggleScheduleEnabledAction: vi.fn(),
}));

import { FontesTableClient } from "./fontes-table-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
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
