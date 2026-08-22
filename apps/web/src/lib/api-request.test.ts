import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: cookiesMock,
}));

import { apiRequest } from "./api-request";

function makeCookieStore(cookieString = "") {
  return {
    get: () => undefined,
    toString: () => cookieString,
  };
}

describe("apiRequest — x-session-internal-id propagation", () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    cookiesMock.mockResolvedValue(makeCookieStore());
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 200 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sets the x-session-internal-id header when a journey session id is passed", async () => {
    await apiRequest(
      "GET",
      "/job-applications",
      undefined,
      1000,
      "journey-abc",
    );

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (options.headers as Record<string, string>)["x-session-internal-id"],
    ).toBe("journey-abc");
  });

  it("omits the header entirely when no journey session id is available — never invents one", async () => {
    await apiRequest("GET", "/job-applications");

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      "x-session-internal-id" in (options.headers as Record<string, string>),
    ).toBe(false);
  });

  it("omits the header when explicitly passed null", async () => {
    await apiRequest("GET", "/job-applications", undefined, 1000, null);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      "x-session-internal-id" in (options.headers as Record<string, string>),
    ).toBe(false);
  });

  it("never leaks one call's session id into a concurrent call with a different id", async () => {
    await Promise.all([
      apiRequest("GET", "/a", undefined, 1000, "journey-session-1"),
      apiRequest("GET", "/b", undefined, 1000, "journey-session-2"),
      apiRequest("GET", "/c", undefined, 1000, null),
    ]);

    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit]
    >;
    const headersByUrl = new Map(
      calls.map(([url, options]) => [
        url,
        (options.headers as Record<string, string>)["x-session-internal-id"],
      ]),
    );

    expect(
      headersByUrl.get(
        Array.from(headersByUrl.keys()).find((u) => u.endsWith("/a")) ?? "",
      ),
    ).toBe("journey-session-1");
    expect(
      headersByUrl.get(
        Array.from(headersByUrl.keys()).find((u) => u.endsWith("/b")) ?? "",
      ),
    ).toBe("journey-session-2");
    expect(
      headersByUrl.get(
        Array.from(headersByUrl.keys()).find((u) => u.endsWith("/c")) ?? "",
      ),
    ).toBeUndefined();
  });
});
