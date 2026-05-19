import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getBackofficeSessionToken: vi.fn(),
  getGlobalSchedulerConfig: vi.fn(),
  listAllIngestionRuns: vi.fn(),
  listJobSources: vi.fn(),
  listJobs: vi.fn(),
  listManualRuns: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("@/lib/backoffice-session.server", () => ({
  getBackofficeSessionToken: mocks.getBackofficeSessionToken,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  getGlobalSchedulerConfig: mocks.getGlobalSchedulerConfig,
  listAllIngestionRuns: mocks.listAllIngestionRuns,
  listJobSources: mocks.listJobSources,
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
  });

  it("shows ligado with cron snippet when source schedule is enabled", async () => {
    mocks.listJobSources.mockResolvedValue([
      {
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
      },
    ]);

    const page = await AdminIngestionPage({
      searchParams: Promise.resolve({ tab: "fontes" }),
    });
    render(page);

    const table = screen.getByRole("table");
    const scope = within(table);

    expect(scope.getByRole("columnheader", { name: "Agendamento" })).toBeInTheDocument();
    expect(scope.getByText(/ligado/i)).toBeInTheDocument();
    expect(scope.getByText(/\*\/30 \* \* \* \*/)).toBeInTheDocument();
  });

  it("shows desligado when source schedule is disabled", async () => {
    mocks.listJobSources.mockResolvedValue([
      {
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
      },
    ]);

    const page = await AdminIngestionPage({
      searchParams: Promise.resolve({ tab: "fontes" }),
    });
    render(page);

    const table = screen.getByRole("table");
    const scope = within(table);

    expect(scope.getByRole("columnheader", { name: "Agendamento" })).toBeInTheDocument();
    expect(scope.getByText(/desligado/i)).toBeInTheDocument();
  });
});
