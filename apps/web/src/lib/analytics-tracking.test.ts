import { beforeEach, describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
}));

import {
  captureAndPersistUtmParams,
  getAnalyticsBaseProperties,
  trackEvent,
} from "./analytics-tracking";

describe("analytics tracking", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
          store.set(key, value);
        },
        removeItem: (key: string) => {
          store.delete(key);
        },
      },
    });

    emitBusinessFunnelEventMock.mockReset();
    emitBusinessFunnelEventMock.mockResolvedValue(undefined);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test_key");
    window.localStorage.removeItem("analytics_first_touch_utm");
    sessionStorage.removeItem("analytics_auth_context");
    sessionStorage.removeItem("journey_session_internal_id");
    sessionStorage.removeItem("journey_current_route_visit_id");
    sessionStorage.removeItem("journey_previous_route");
    sessionStorage.removeItem("analytics_posthog_session_id");
    window.history.replaceState({}, "", "/");
  });

  it("persists first-touch utm and does not overwrite on next route", () => {
    window.history.replaceState(
      {},
      "",
      "/?utm_source=linkedin&utm_medium=dm&utm_campaign=validacao_open_to_work&utm_content=v1",
    );

    const firstTouch = captureAndPersistUtmParams();
    expect(firstTouch).toMatchObject({
      utm_source: "linkedin",
      utm_medium: "dm",
      utm_campaign: "validacao_open_to_work",
      utm_content: "v1",
    });

    window.history.replaceState({}, "", "/adaptar");
    const stillFirstTouch = captureAndPersistUtmParams();
    expect(stillFirstTouch).toMatchObject({
      utm_source: "linkedin",
      utm_medium: "dm",
      utm_campaign: "validacao_open_to_work",
      utm_content: "v1",
    });
  });

  it("includes url, search and persisted utm on page_view payload", async () => {
    window.history.replaceState(
      {},
      "",
      "/?utm_source=linkedin&utm_medium=dm&utm_campaign=validacao_open_to_work&utm_content=v1",
    );

    await trackEvent({ eventName: "page_view" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(options?.body ?? "{}"));
    expect(payload.eventName).toBe("page_view");
    expect(payload.metadata).toMatchObject({
      route: "/",
      url: `${window.location.origin}/?utm_source=linkedin&utm_medium=dm&utm_campaign=validacao_open_to_work&utm_content=v1`,
      search:
        "?utm_source=linkedin&utm_medium=dm&utm_campaign=validacao_open_to_work&utm_content=v1",
      utm_source: "linkedin",
      utm_medium: "dm",
      utm_campaign: "validacao_open_to_work",
      utm_content: "v1",
    });
    expect(options?.headers?.["x-posthog-session-id"]).toBeUndefined();
  });

  it("sends event to GA4 when gtag is available", async () => {
    const gtagMock = vi.fn();
    window.gtag = gtagMock;
    window.history.replaceState(
      {},
      "",
      "/adaptar?utm_source=linkedin&utm_medium=dm",
    );

    await trackEvent({ eventName: "analysis_started" });

    expect(gtagMock).toHaveBeenCalledWith("event", "analysis_started", {
      utm_source: "linkedin",
      utm_medium: "dm",
      utm_campaign: undefined,
      utm_content: undefined,
      utm_term: undefined,
      page_location: `${window.location.origin}/adaptar?utm_source=linkedin&utm_medium=dm`,
      page_path: "/adaptar",
      page_referrer: "",
    });
  });

  it("builds analytics base properties with current route context", () => {
    window.history.replaceState({}, "", "/adaptar");
    sessionStorage.setItem("analytics_posthog_session_id", "ph-session-123");

    const base = getAnalyticsBaseProperties();
    expect(base).toMatchObject({
      route: "/adaptar",
      url: `${window.location.origin}/adaptar`,
      search: "",
      source: "frontend",
      app: "earlycv",
    });
    expect(base).toHaveProperty("sessionInternalId");
    expect(base).toHaveProperty("routeVisitId");
    expect(base).toHaveProperty("$session_id", "ph-session-123");
  });

  it("sends x-posthog-session-id header when available", async () => {
    sessionStorage.setItem("analytics_posthog_session_id", "ph-session-777");

    await trackEvent({ eventName: "session_started" });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    expect(options?.headers).toMatchObject({
      "x-posthog-session-id": "ph-session-777",
    });
  });

  it("waits briefly for PostHog session id on priority events", async () => {
    setTimeout(() => {
      sessionStorage.setItem("analytics_posthog_session_id", "ph-session-late");
    }, 20);

    await trackEvent({ eventName: "session_started" });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(options?.body ?? "{}"));

    expect(options?.headers).toMatchObject({
      "x-posthog-session-id": "ph-session-late",
    });
    expect(payload.metadata.$session_id).toBe("ph-session-late");
  });

  it("includes authenticated user context and enforces it on event metadata", async () => {
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({ isAuthenticated: true, userId: "user-123" }),
    );

    await trackEvent({
      eventName: "analyze_submit_clicked",
      properties: {
        isAuthenticated: false,
        userId: null,
      },
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(options?.body ?? "{}"));
    expect(payload.metadata).toMatchObject({
      isAuthenticated: true,
      userId: "user-123",
      user_id: "user-123",
      event_version: 1,
    });
  });
});
