import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
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
  it("não mostra os botões de ativar/desativar em massa sem adapter selecionado", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(<FontesTableClient initialData={emptyResult} />);

    expect(screen.queryByText(/Ativar agendamento/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Desativar agendamento/),
    ).not.toBeInTheDocument();
  });

  it("mostra os botões de ativar/desativar em massa quando um adapter é pré-selecionado via URL", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    render(
      <FontesTableClient initialData={emptyResult} initialTypeFilter="gupy" />,
    );

    expect(screen.getByText("Ativar agendamento (gupy)")).toBeInTheDocument();
    expect(
      screen.getByText("Desativar agendamento (gupy)"),
    ).toBeInTheDocument();
  });
});
