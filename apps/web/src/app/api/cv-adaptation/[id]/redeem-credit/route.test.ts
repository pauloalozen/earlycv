import { describe, expect, it, vi } from "vitest";

const getCurrentAppSessionMock = vi.fn();

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppSession: getCurrentAppSessionMock,
}));

describe("POST /api/cv-adaptation/[id]/redeem-credit", () => {
  it("returns 401 when there is no access token", async () => {
    getCurrentAppSessionMock.mockResolvedValueOnce(null);

    const { POST } = await import("./route");
    const request = new Request(
      "http://localhost/api/cv-adaptation/a/redeem-credit",
      {
        method: "POST",
        body: JSON.stringify({ selectedMissingKeywords: ["Python"] }),
        headers: { "Content-Type": "application/json" },
      },
    );

    const response = await POST(request as never, {
      params: Promise.resolve({ id: "adapt-1" }),
    });

    expect(response.status).toBe(401);
  });

  it("forwards selectedMissingKeywords payload to API", async () => {
    getCurrentAppSessionMock.mockResolvedValueOnce({
      accessToken: "token-123",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { POST } = await import("./route");
    const body = { selectedMissingKeywords: ["Python", "SQL"] };
    const request = new Request(
      "http://localhost/api/cv-adaptation/a/redeem-credit",
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      },
    );

    await POST(request as never, {
      params: Promise.resolve({ id: "adapt-1" }),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:4000/api/cv-adaptation/adapt-1/redeem-credit",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(body),
      },
    );
  });
});
