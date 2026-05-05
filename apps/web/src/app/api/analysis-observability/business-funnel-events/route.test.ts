import { describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("/api/analysis-observability/business-funnel-events route", () => {
  it("forwards x-posthog-session-id header to API", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 202 }));

    const request = new Request(
      "http://localhost:3000/api/analysis-observability/business-funnel-events",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-posthog-session-id": "ph-session-header-1",
        },
        body: JSON.stringify({
          eventName: "page_view",
          eventVersion: 1,
          metadata: {},
        }),
      },
    );

    await POST(request);

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const headers = options?.headers as Record<string, string>;
    expect(headers["x-posthog-session-id"]).toBe("ph-session-header-1");

    fetchMock.mockRestore();
  });

  it("falls back to metadata.$session_id when header is missing", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("{}", { status: 202 }));

    const request = new Request(
      "http://localhost:3000/api/analysis-observability/business-funnel-events",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventName: "page_leave",
          eventVersion: 1,
          metadata: {
            $session_id: "ph-session-body-1",
          },
        }),
      },
    );

    await POST(request);

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const headers = options?.headers as Record<string, string>;
    expect(headers["x-posthog-session-id"]).toBe("ph-session-body-1");

    fetchMock.mockRestore();
  });
});
