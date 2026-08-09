import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    style,
    onClick,
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    onClick?: (e: React.MouseEvent) => void;
  }) => (
    <a href={href} style={style} onClick={onClick}>
      {children}
    </a>
  ),
}));

import { DashboardAdapterTable } from "@/app/admin/_components/dashboard-adapter-table";
import { DashboardAlertsRow } from "@/app/admin/_components/dashboard-alerts-row";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

describe("DashboardAlertsRow (faixa 2 — alertas operacionais)", () => {
  it("aplica classe/cor de alerta quando o contador é > 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          pausedSources: 2,
          sourcesWith403: 0,
          driftSources: 0,
          failedJobsToday: 0,
        }),
      ),
    );

    render(<DashboardAlertsRow />);

    const value = await screen.findByText("2");
    expect(value).toHaveStyle({ color: "#9b2c2c" });
  });

  it("permanece neutro quando o contador é 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          pausedSources: 0,
          sourcesWith403: 0,
          driftSources: 0,
          failedJobsToday: 0,
        }),
      ),
    );

    render(<DashboardAlertsRow />);

    const values = await screen.findAllByText("0");
    for (const value of values) {
      expect(value).toHaveStyle({ color: "#2a2620" });
    }
  });
});

describe("DashboardAdapterTable (faixa 3 — captura por adapter)", () => {
  it("renderiza uma linha por adapter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          adapters: [
            {
              adapterType: "gupy",
              totalSources: 164,
              activeSources: 164,
              pausedSources: 0,
              sourcesWith403: 0,
              lastRunAt: null,
              runsLast24h: 27,
              failedRunsLast24h: 0,
              newJobsLast24h: 47,
              nextJobRunAt: null,
            },
            {
              adapterType: "workday",
              totalSources: 12,
              activeSources: 12,
              pausedSources: 0,
              sourcesWith403: 1,
              lastRunAt: null,
              runsLast24h: 5,
              failedRunsLast24h: 1,
              newJobsLast24h: 3,
              nextJobRunAt: null,
            },
          ],
        }),
      ),
    );

    render(<DashboardAdapterTable />);

    expect(await screen.findByText("gupy")).toBeInTheDocument();
    expect(await screen.findByText("workday")).toBeInTheDocument();
  });

  it("colore em vermelho a linha com pausedSources > 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          adapters: [
            {
              adapterType: "workday",
              totalSources: 12,
              activeSources: 11,
              pausedSources: 1,
              sourcesWith403: 0,
              lastRunAt: null,
              runsLast24h: 5,
              failedRunsLast24h: 0,
              newJobsLast24h: 3,
              nextJobRunAt: null,
            },
          ],
        }),
      ),
    );

    render(<DashboardAdapterTable />);

    const adapterCell = await screen.findByText("workday");
    const row = adapterCell.closest("tr");

    await waitFor(() => {
      expect(row).toHaveStyle({ background: "#f5dada" });
    });
  });
});
