import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const getBackofficeSessionTokenMock = vi.hoisted(() => vi.fn());
const getJobSourceMock = vi.hoisted(() => vi.fn());
const listIngestionRunsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/backoffice-session.server", () => ({
  getBackofficeSessionToken: getBackofficeSessionTokenMock,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  getJobSource: getJobSourceMock,
  listIngestionRuns: listIngestionRunsMock,
}));

import JobSourceAdminPage from "./[jobSourceId]/page";

afterEach(() => {
  cleanup();
});

describe("JobSourceAdminPage schedule", () => {
  it("shows schedule state, cron and timezone", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getJobSourceMock.mockResolvedValue({
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      lastCheckedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      parserKey: "gupy",
      scheduleCron: "*/30 * * * *",
      scheduleEnabled: true,
      scheduleTimezone: "America/Sao_Paulo",
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    });
    listIngestionRunsMock.mockResolvedValue({
      limit: 25,
      page: 1,
      runs: [],
      total: 0,
    });

    const page = await JobSourceAdminPage({
      params: Promise.resolve({ jobSourceId: "src_1" }),
      searchParams: Promise.resolve({}),
    });

    render(page);

    const scheduleCardHeading = screen.getByRole("heading", {
      level: 2,
      name: "Agendamento",
    });
    expect(scheduleCardHeading).toBeInTheDocument();

    const scheduleCard = scheduleCardHeading.closest("div");
    expect(scheduleCard).not.toBeNull();
    const cardScope = within(scheduleCard as HTMLElement);

    expect(cardScope.getByText("Status")).toBeInTheDocument();
    expect(cardScope.getByText("Escalonado")).toBeInTheDocument();
    expect(cardScope.getByText("Frequência")).toBeInTheDocument();
    // "*/30 * * * *" (a cada 30 minutos) nao corresponde a nenhum dos 3
    // padroes do picker humano (diario / a cada N horas / semanal) —
    // cai no fallback UNKNOWN, que exibe o cron cru.
    expect(cardScope.getByText("*/30 * * * *")).toBeInTheDocument();
    expect(cardScope.getByText("Fuso")).toBeInTheDocument();
    expect(cardScope.getByText("America/Sao_Paulo")).toBeInTheDocument();
  });

  it("shows disabled state with fallback values", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getJobSourceMock.mockResolvedValue({
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      lastCheckedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      parserKey: "gupy",
      scheduleCron: null,
      scheduleEnabled: false,
      scheduleTimezone: null,
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    });
    listIngestionRunsMock.mockResolvedValue({
      limit: 25,
      page: 1,
      runs: [],
      total: 0,
    });

    const page = await JobSourceAdminPage({
      params: Promise.resolve({ jobSourceId: "src_1" }),
      searchParams: Promise.resolve({}),
    });

    render(page);

    const scheduleCardHeading = screen.getByRole("heading", {
      level: 2,
      name: "Agendamento",
    });
    expect(scheduleCardHeading).toBeInTheDocument();

    const scheduleCard = scheduleCardHeading.closest("div");
    expect(scheduleCard).not.toBeNull();
    const cardScope = within(scheduleCard as HTMLElement);

    expect(cardScope.getByText("Status")).toBeInTheDocument();
    expect(cardScope.getByText("Desligado")).toBeInTheDocument();
    expect(cardScope.getByText("Frequência")).toBeInTheDocument();
    expect(cardScope.getByText("-")).toBeInTheDocument();
    expect(cardScope.getByText("Fuso")).toBeInTheDocument();
    expect(cardScope.getByText("America/Sao_Paulo")).toBeInTheDocument();
  });

  it("shows disabled status when cron is missing even if enabled", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getJobSourceMock.mockResolvedValue({
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      lastCheckedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      parserKey: "gupy",
      scheduleCron: null,
      scheduleEnabled: true,
      scheduleTimezone: "America/Sao_Paulo",
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    });
    listIngestionRunsMock.mockResolvedValue({
      limit: 25,
      page: 1,
      runs: [],
      total: 0,
    });

    const page = await JobSourceAdminPage({
      params: Promise.resolve({ jobSourceId: "src_1" }),
      searchParams: Promise.resolve({}),
    });

    render(page);

    const scheduleCardHeading = screen.getByRole("heading", {
      level: 2,
      name: "Agendamento",
    });
    const scheduleCard = scheduleCardHeading.closest("div");
    expect(scheduleCard).not.toBeNull();
    const cardScope = within(scheduleCard as HTMLElement);
    expect(cardScope.getByText("Desligado")).toBeInTheDocument();
  });
});

describe("JobSourceAdminPage historico de runs", () => {
  it("pede a pagina da URL e mostra navegacao entre paginas", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getJobSourceMock.mockResolvedValue({
      checkIntervalMinutes: 30,
      company: { id: "cmp_1", name: "ACME", normalizedName: "acme" },
      companyId: "cmp_1",
      id: "src_1",
      isActive: true,
      lastCheckedAt: null,
      lastErrorAt: null,
      lastErrorMessage: null,
      lastSuccessAt: null,
      parserKey: "gupy",
      scheduleCron: null,
      scheduleEnabled: false,
      scheduleTimezone: "America/Sao_Paulo",
      sourceName: "ACME Careers",
      sourceType: "gupy",
      sourceUrl: "https://acme.gupy.io",
    });
    listIngestionRunsMock.mockResolvedValue({
      limit: 25,
      page: 2,
      runs: [
        {
          failedCount: 0,
          id: "run_1",
          newCount: 3,
          startedAt: "2026-10-01T10:00:00.000Z",
          status: "completed",
          updatedCount: 1,
        },
      ],
      total: 60,
    });

    const page = await JobSourceAdminPage({
      params: Promise.resolve({ jobSourceId: "src_1" }),
      searchParams: Promise.resolve({ runsPage: "2" }),
    });

    render(page);

    expect(listIngestionRunsMock).toHaveBeenLastCalledWith("src_1", {
      page: 2,
    });
    expect(screen.getByText(/60 runs - pagina 2 de 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mais recentes" })).toHaveAttribute(
      "href",
      "/admin/ingestion/src_1?runsPage=1",
    );
    expect(screen.getByRole("link", { name: "Mais antigos" })).toHaveAttribute(
      "href",
      "/admin/ingestion/src_1?runsPage=3",
    );
  });
});
