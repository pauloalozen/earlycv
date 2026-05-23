import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBackofficeSessionToken: vi.fn(),
  getManualRunById: vi.fn(),
  listManualRunItems: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/backoffice-session.server", () => ({
  getBackofficeSessionToken: mocks.getBackofficeSessionToken,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  getManualRunById: mocks.getManualRunById,
  listManualRunItems: mocks.listManualRunItems,
}));

vi.mock("../../actions", () => ({
  cancelManualRunAction: vi.fn(),
}));

import ManualRunDetailPage from "./page";

afterEach(() => {
  cleanup();
});

describe("ManualRunDetailPage summary", () => {
  beforeEach(() => {
    mocks.getBackofficeSessionToken.mockResolvedValue("token-1");
  });

  it("computes counters from items even with inconsistent run aggregates", async () => {
    mocks.getManualRunById.mockResolvedValue({
      cancelRequestedAt: null,
      createdAt: "2026-04-01T10:00:00.000Z",
      failedCount: 7,
      finishedAt: "2026-04-01T10:03:00.000Z",
      id: "run_1",
      requestedByUserId: "usr_1",
      scopeType: "adapter",
      scopeValue: "gupy",
      skippedCount: 9,
      startedAt: "2026-04-01T10:00:00.000Z",
      status: "completed",
      succeededCount: 5,
      totalSources: 99,
      updatedAt: "2026-04-01T10:03:00.000Z",
    });

    mocks.listManualRunItems.mockResolvedValue([
      {
        batchRunId: "run_1",
        companyName: "Empresa 1",
        createdAt: "2026-04-01T10:00:00.000Z",
        errorMessage: null,
        finishedAt: null,
        id: "item_1",
        jobSourceId: "src_1",
        sourceName: "Fonte 1",
        sourceType: "gupy",
        startedAt: null,
        status: "completed",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      {
        batchRunId: "run_1",
        companyName: "Empresa 2",
        createdAt: "2026-04-01T10:00:00.000Z",
        errorMessage: "erro",
        finishedAt: null,
        id: "item_2",
        jobSourceId: "src_2",
        sourceName: "Fonte 2",
        sourceType: "gupy",
        startedAt: null,
        status: "failed",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      {
        batchRunId: "run_1",
        companyName: "Empresa 3",
        createdAt: "2026-04-01T10:00:00.000Z",
        errorMessage: null,
        finishedAt: null,
        id: "item_3",
        jobSourceId: "src_3",
        sourceName: "Fonte 3",
        sourceType: "gupy",
        startedAt: null,
        status: "skipped",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
      {
        batchRunId: "run_1",
        companyName: "Empresa 4",
        createdAt: "2026-04-01T10:00:00.000Z",
        errorMessage: null,
        finishedAt: null,
        id: "item_4",
        jobSourceId: "src_4",
        sourceName: "Fonte 4",
        sourceType: "gupy",
        startedAt: null,
        status: "cancelled",
        updatedAt: "2026-04-01T10:00:00.000Z",
      },
    ]);

    const page = await ManualRunDetailPage({
      params: Promise.resolve({ batchRunId: "run_1" }),
    });
    render(page);

    expect(screen.getByText("Total: 4")).toBeInTheDocument();
    expect(screen.getByText("Sucesso: 1")).toBeInTheDocument();
    expect(screen.getByText("Falha: 1")).toBeInTheDocument();
    expect(screen.getByText("Skip: 2")).toBeInTheDocument();
    expect(
      screen.getByText("Calculado a partir dos itens do lote."),
    ).toBeInTheDocument();

    expect(screen.queryByText("Total: 99")).not.toBeInTheDocument();
    expect(screen.queryByText("Sucesso: 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Falha: 7")).not.toBeInTheDocument();
    expect(screen.queryByText("Skip: 9")).not.toBeInTheDocument();
  });
});
