import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBackofficeSessionTokenMock = vi.fn(async () => "mock-token");

vi.mock("./backoffice-session.server", () => {
  return {
    getBackofficeSessionToken: getBackofficeSessionTokenMock,
  };
});

describe("admin-analysis-events-api", () => {
  beforeEach(() => {
    getBackofficeSessionTokenMock.mockResolvedValue("mock-token");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("lists analysis observability events catalog from admin endpoint", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          business: [{ eventName: "analysis_started", eventVersion: 1 }],
          protection: [{ eventName: "analysis_completed", eventVersion: 3 }],
        }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { listAdminAnalysisEventsCatalog } = await import(
      "./admin-analysis-events-api"
    );

    const response = await listAdminAnalysisEventsCatalog();

    expect(response.business).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/admin\/analysis-observability\/events\/catalog$/,
      ),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer mock-token",
        }),
      }),
    );
  });

  it("emits analysis observability events using admin endpoint", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          failed: 0,
          requested: 1,
          results: [
            {
              domain: "protection",
              eventName: "analysis_started",
              status: "sent",
            },
          ],
          sent: 1,
        }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { emitAdminAnalysisEvents } = await import(
      "./admin-analysis-events-api"
    );

    const response = await emitAdminAnalysisEvents(
      {
        eventName: "analysis_started",
        mode: "single",
      },
      "token-1",
    );

    expect(response.sent).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/analysis-observability\/events\/emit$/),
      expect.objectContaining({
        body: JSON.stringify({ eventName: "analysis_started", mode: "single" }),
        method: "POST",
      }),
    );
  });

  it("throws when API responds with non-ok status", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 502,
        text: async () => "bad gateway",
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { listAdminAnalysisEventsCatalog } = await import(
      "./admin-analysis-events-api"
    );

    await expect(listAdminAnalysisEventsCatalog()).rejects.toThrow(
      "API 502: bad gateway",
    );
  });

  it("rejects when no backoffice token is available", async () => {
    getBackofficeSessionTokenMock.mockResolvedValue(undefined);
    const fetchMock = vi.fn();

    vi.stubGlobal("fetch", fetchMock);

    const { listAdminAnalysisEventsCatalog } = await import(
      "./admin-analysis-events-api"
    );

    await expect(listAdminAnalysisEventsCatalog()).rejects.toThrow(
      "Missing backoffice session token.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
