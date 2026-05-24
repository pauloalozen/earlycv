import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBackofficeSessionToken: vi.fn(),
  getGlobalSchedulerConfig: vi.fn(),
  listAllIngestionRuns: vi.fn(),
  listJobSources: vi.fn(),
  listJobSourcesPaginated: vi.fn(),
  listJobs: vi.fn(),
  listManualRuns: vi.fn(),
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
  getGlobalSchedulerConfig: mocks.getGlobalSchedulerConfig,
  listAllIngestionRuns: mocks.listAllIngestionRuns,
  listJobSources: mocks.listJobSources,
  listJobSourcesPaginated: mocks.listJobSourcesPaginated,
  listJobs: mocks.listJobs,
  listManualRuns: mocks.listManualRuns,
}));

vi.mock("./actions", () => ({
  cancelManualRunAction: vi.fn(),
  deleteJobSourceAction: vi.fn(),
  importCompanySourcesCsvAction: vi.fn(),
  runGlobalSchedulerNowAction: vi.fn(),
  runJobSourceAction: vi.fn(),
  startManualAdapterRunAction: vi.fn(),
  toggleScheduleEnabledAction: vi.fn(),
  updateGlobalSchedulerAction: vi.fn(),
}));

import AdminIngestionPage from "./page";

afterEach(() => {
  cleanup();
});

describe("AdminIngestionPage fontes schedule signal", () => {
  beforeEach(() => {
    mocks.getBackofficeSessionToken.mockResolvedValue("token-1");
    mocks.listManualRuns.mockResolvedValue([]);
    mocks.listAllIngestionRuns.mockResolvedValue([]);
    mocks.getGlobalSchedulerConfig.mockResolvedValue({
      enabled: true,
      errorDelayMs: 60000,
      globalCron: "*/15 * * * *",
      id: "scheduler-1",
      normalDelayMs: 10000,
      timezone: "America/Sao_Paulo",
    });
    mocks.listJobs.mockResolvedValue([]);
    mocks.listJobSources.mockResolvedValue([]);
    mocks.listJobSourcesPaginated.mockResolvedValue({
      page: 1,
      pageSize: 50,
      rows: [],
      total: 0,
      totalPages: 1,
    });
  });

  it("renders Agendamento column with cron when schedule enabled", async () => {
    const source = {
      activeJobsCount: 0,
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      parserKey: "gupy",
      scheduleCron: "*/30 * * * *",
      scheduleEnabled: true,
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    };
    mocks.listJobSources.mockResolvedValue([source]);
    mocks.listJobSourcesPaginated.mockResolvedValue({
      page: 1,
      pageSize: 50,
      rows: [source],
      total: 1,
      totalPages: 1,
    });

    const page = await AdminIngestionPage({
      searchParams: Promise.resolve({ tab: "fontes" }),
    });
    render(page);

    const table = screen.getByRole("table");
    const scope = within(table);

    expect(
      scope.getByRole("columnheader", { name: "Agendamento" }),
    ).toBeInTheDocument();
    // cron expression visible next to toggle
    expect(scope.getByText(/\*\/30 \* \* \* \*/)).toBeInTheDocument();
    // toggle button present (title distinguishes on/off)
    expect(
      scope.getByRole("button", { name: /desativar agendamento/i }),
    ).toBeInTheDocument();
  });

  it("renders toggle off and no cron when schedule disabled", async () => {
    const source = {
      activeJobsCount: 0,
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      parserKey: "gupy",
      scheduleCron: null,
      scheduleEnabled: false,
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    };
    mocks.listJobSources.mockResolvedValue([source]);
    mocks.listJobSourcesPaginated.mockResolvedValue({
      page: 1,
      pageSize: 50,
      rows: [source],
      total: 1,
      totalPages: 1,
    });

    const page = await AdminIngestionPage({
      searchParams: Promise.resolve({ tab: "fontes" }),
    });
    render(page);

    const table = screen.getByRole("table");
    const scope = within(table);

    expect(
      scope.getByRole("columnheader", { name: "Agendamento" }),
    ).toBeInTheDocument();
    expect(
      scope.getByRole("button", { name: /ativar agendamento/i }),
    ).toBeInTheDocument();
  });
});
