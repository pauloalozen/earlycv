import { describe, expect, it, vi } from "vitest";

describe("POST /api/auth/oauth-attempts", () => {
  it("forwards the request body to the backend and returns the opaque state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ state: "opaque-state" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const body = {
      jobId: "job-1",
      guestPossessionToken: "raw-token",
      conversionContext: "analysis_guest",
    };
    const request = new Request("http://localhost/api/auth/oauth-attempts", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request as never);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ state: "opaque-state" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/auth/oauth-attempts");
    expect(init.body).toBe(JSON.stringify(body));

    vi.unstubAllGlobals();
  });

  it("passes through the backend's error status (e.g. invalid possession token)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("invalid guest analysis reference", { status: 401 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const request = new Request("http://localhost/api/auth/oauth-attempts", {
      method: "POST",
      body: JSON.stringify({ jobId: "job-1", guestPossessionToken: "bad" }),
      headers: { "Content-Type": "application/json" },
    });

    const response = await POST(request as never);
    expect(response.status).toBe(401);

    vi.unstubAllGlobals();
  });
});
