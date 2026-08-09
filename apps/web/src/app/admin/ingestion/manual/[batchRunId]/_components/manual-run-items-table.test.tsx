import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ManualRunItemRecord } from "@/lib/admin-ingestion-api";
import { ManualRunItemsTable } from "./manual-run-items-table";

afterEach(() => {
  cleanup();
});

function buildItems(count: number): ManualRunItemRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    batchRunId: "run_1",
    companyName: `Empresa ${i + 1}`,
    createdAt: "2026-04-01T10:00:00.000Z",
    errorMessage: null,
    finishedAt: null,
    id: `item_${i + 1}`,
    ingestionRun: null,
    jobSourceId: `src_${i + 1}`,
    sourceName: `Fonte ${i + 1}`,
    sourceType: "gupy",
    startedAt: null,
    status: i % 5 === 0 ? "failed" : "completed",
    updatedAt: "2026-04-01T10:00:00.000Z",
  }));
}

describe("ManualRunItemsTable", () => {
  it("mostra apenas 50 itens por página quando há 795 itens", () => {
    render(<ManualRunItemsTable items={buildItems(795)} />);

    expect(screen.getByText("Mostrando 1–50 de 795")).toBeInTheDocument();
    expect(screen.getByText("Empresa 1")).toBeInTheDocument();
    expect(screen.queryByText("Empresa 51")).not.toBeInTheDocument();
  });

  it("avança para a próxima página ao clicar em Próxima", () => {
    render(<ManualRunItemsTable items={buildItems(795)} />);

    fireEvent.click(screen.getByText("Próxima"));

    expect(screen.getByText("Mostrando 51–100 de 795")).toBeInTheDocument();
    expect(screen.getByText("Empresa 51")).toBeInTheDocument();
    expect(screen.queryByText("Empresa 1")).not.toBeInTheDocument();
  });

  it("filtra por status e reseta para a página 1", () => {
    render(<ManualRunItemsTable items={buildItems(795)} />);

    fireEvent.click(screen.getByText("Próxima"));
    expect(screen.getByText("Mostrando 51–100 de 795")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "failed" },
    });

    // 795 itens, 1 a cada 5 é "failed" (índices 0,5,10,...) => 159 failed
    expect(screen.getByText("Mostrando 1–50 de 159")).toBeInTheDocument();
  });
});
