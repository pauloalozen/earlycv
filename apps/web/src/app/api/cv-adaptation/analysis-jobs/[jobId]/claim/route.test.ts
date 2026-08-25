import { describe, expect, it, vi } from "vitest";

const getCurrentAppSessionMock = vi.fn();
const getAppSessionTokensMock = vi.fn();

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppSession: getCurrentAppSessionMock,
  getAppSessionTokens: getAppSessionTokensMock,
}));

describe("POST /api/cv-adaptation/analysis-jobs/[jobId]/claim", () => {
  it("returns 401 when there is no access token", async () => {
    getCurrentAppSessionMock.mockResolvedValueOnce(null);
    getAppSessionTokensMock.mockResolvedValueOnce({ accessToken: null });

    const { POST } = await import("./route");
    const request = new Request(
      "http://localhost/api/cv-adaptation/analysis-jobs/job-1/claim",
      { method: "POST" },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ jobId: "job-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("forwards Authorization + guestPossessionToken body to the backend claim endpoint", async () => {
    getCurrentAppSessionMock.mockResolvedValueOnce({
      accessToken: "token-123",
    });
    getAppSessionTokensMock.mockResolvedValueOnce({ accessToken: null });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ status: "succeeded", cvAdaptationId: "adapt-1" }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const request = new Request(
      "http://localhost/api/cv-adaptation/analysis-jobs/job-1/claim",
      {
        method: "POST",
        body: JSON.stringify({ guestPossessionToken: "raw-token" }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ jobId: "job-1" }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/cv-adaptation/analysis-jobs/job-1/claim");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-123",
    );
    expect(init.body).toBe(
      JSON.stringify({ guestPossessionToken: "raw-token" }),
    );

    vi.unstubAllGlobals();
  });

  it("sends an empty JSON object when no body is provided (Google flow: ownership already transferred)", async () => {
    getCurrentAppSessionMock.mockResolvedValueOnce({
      accessToken: "token-123",
    });
    getAppSessionTokensMock.mockResolvedValueOnce({ accessToken: null });

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "processing" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const request = new Request(
      "http://localhost/api/cv-adaptation/analysis-jobs/job-1/claim",
      { method: "POST" },
    );

    await POST(request as never, {
      params: Promise.resolve({ jobId: "job-1" }),
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe("{}");

    vi.unstubAllGlobals();
  });
});
