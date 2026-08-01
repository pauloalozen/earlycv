import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBackofficeSessionTokenMock = vi.hoisted(() => vi.fn());
const getActiveSemanticFilterConfigMock = vi.hoisted(() => vi.fn());
const listEnrichmentJobsMock = vi.hoisted(() => vi.fn());
const listJobSourcesMock = vi.hoisted(() => vi.fn());
const getCrawlerDiscardsCountMock = vi.hoisted(() => vi.fn());
const listCrawlerDiscardsMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/backoffice-session.server", () => ({
  getBackofficeSessionToken: getBackofficeSessionTokenMock,
}));

vi.mock("@/lib/admin-semantic-filter-api", () => ({
  getActiveSemanticFilterConfig: getActiveSemanticFilterConfigMock,
  listEnrichmentJobs: listEnrichmentJobsMock,
}));

vi.mock("@/lib/admin-ingestion-api", () => ({
  listJobSources: listJobSourcesMock,
}));

vi.mock("@/lib/admin-crawler-discards-api", () => ({
  getCrawlerDiscardsCount: getCrawlerDiscardsCountMock,
  listCrawlerDiscards: listCrawlerDiscardsMock,
}));

import AdminSemanticFilterPage from "./page";

function jobsPage(rows: unknown[] = []) {
  return { page: 1, pageSize: 20, rows, total: rows.length, totalPages: 1 };
}

beforeEach(() => {
  // EnrichmentWorkerControls e SemanticFilterDashboardCards fazem fetch
  // client-side no mount (config/status polling) que nao interessa a este
  // teste — stub evita rejeicoes nao tratadas por URL relativa no jsdom.
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminSemanticFilterPage crawler discards panel", () => {
  it("shows the discards card with the total count", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getActiveSemanticFilterConfigMock.mockResolvedValue(null);
    listEnrichmentJobsMock.mockResolvedValue(jobsPage());
    listJobSourcesMock.mockResolvedValue([]);
    getCrawlerDiscardsCountMock.mockResolvedValue(7);

    const page = await AdminSemanticFilterPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(
      screen.getAllByText("Descartados no crawler").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders the discards tab and table when tab=discards", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getActiveSemanticFilterConfigMock.mockResolvedValue(null);
    listEnrichmentJobsMock.mockResolvedValue(jobsPage());
    listJobSourcesMock.mockResolvedValue([]);
    getCrawlerDiscardsCountMock.mockResolvedValue(1);
    listCrawlerDiscardsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      rows: [
        {
          canonicalKey: "gupy:x:1",
          discardedAt: "2026-07-31T10:00:00.000Z",
          filterReason: "noise_signal:enfermeiro",
          filterVersion: "v1",
          id: "discard-1",
          sourceName: "ACME",
          title: "Enfermeiro Plantonista",
          whitelistedAt: null,
        },
      ],
      total: 1,
      totalPages: 1,
    });

    const page = await AdminSemanticFilterPage({
      searchParams: Promise.resolve({ tab: "discards" }),
    });
    render(page);

    expect(listCrawlerDiscardsMock).toHaveBeenCalled();
    expect(screen.getByText("Enfermeiro Plantonista")).toBeInTheDocument();
    expect(screen.getByText("ACME")).toBeInTheDocument();
    expect(screen.getByText("noise_signal:enfermeiro")).toBeInTheDocument();
  });

  it("does not fetch discards list when tab is enrichment (default)", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getActiveSemanticFilterConfigMock.mockResolvedValue(null);
    listEnrichmentJobsMock.mockResolvedValue(jobsPage());
    listJobSourcesMock.mockResolvedValue([]);
    getCrawlerDiscardsCountMock.mockResolvedValue(0);

    const page = await AdminSemanticFilterPage({
      searchParams: Promise.resolve({}),
    });
    render(page);

    expect(listCrawlerDiscardsMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Vagas por status de enriquecimento"),
    ).toBeInTheDocument();
  });

  it("shows whitelisted pill for already-whitelisted discards", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue("token-1");
    getActiveSemanticFilterConfigMock.mockResolvedValue(null);
    listEnrichmentJobsMock.mockResolvedValue(jobsPage());
    listJobSourcesMock.mockResolvedValue([]);
    getCrawlerDiscardsCountMock.mockResolvedValue(1);
    listCrawlerDiscardsMock.mockResolvedValue({
      page: 1,
      pageSize: 20,
      rows: [
        {
          canonicalKey: "gupy:x:2",
          discardedAt: "2026-07-31T10:00:00.000Z",
          filterReason: "zona_cinza",
          filterVersion: "v1",
          id: "discard-2",
          sourceName: "ACME",
          title: "Coordenador de Eventos",
          whitelistedAt: "2026-07-31T11:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
    });

    const page = await AdminSemanticFilterPage({
      searchParams: Promise.resolve({ tab: "discards" }),
    });
    render(page);

    expect(screen.getByText("Whitelisted")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Whitelist" }),
    ).not.toBeInTheDocument();
  });
});
