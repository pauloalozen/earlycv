import { describe, expect, it, vi } from "vitest";

vi.mock("./backoffice-session.server", () => {
  return {
    getBackofficeSessionToken: vi.fn(async () => "mock-token"),
  };
});

describe("admin-analysis-config-api", () => {
  it("lists analysis protection configs from admin endpoint", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({ entries: [{ key: "kill_switch_enabled" }] }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { listAnalysisProtectionConfigs } = await import(
      "./admin-analysis-config-api"
    );

    const response = await listAnalysisProtectionConfigs("token-1");

    expect(response.entries).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/admin\/analysis-protection\/config$/),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token-1",
        }),
      }),
    );
  });

  it("updates analysis protection config using patch endpoint", async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: true,
        json: async () => ({
          entry: {
            key: "rate_limit_raw_per_minute",
            origin: "database",
            value: 120,
          },
        }),
      } as Response;
    });

    vi.stubGlobal("fetch", fetchMock);

    const { updateAnalysisProtectionConfig } = await import(
      "./admin-analysis-config-api"
    );

    const response = await updateAnalysisProtectionConfig(
      "rate_limit_raw_per_minute",
      {
        source: "ui",
        technicalContext: { panel: "admin" },
        value: "120",
      },
      "token-1",
    );

    expect(response.entry.origin).toBe("database");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/admin\/analysis-protection\/config\/rate_limit_raw_per_minute$/,
      ),
      expect.objectContaining({ method: "PATCH" }),
    );
  });
});
