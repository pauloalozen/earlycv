import { beforeEach, describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cv-adaptation-api", () => ({
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
}));

import {
  __resetAnalyticsTrackingForTests,
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
    vi.stubEnv("NEXT_PUBLIC_ANALYTICS_CONSENT_ENABLED", "true");
    __resetAnalyticsTrackingForTests();
    window.localStorage.removeItem("analytics_first_touch_utm");
    window.localStorage.setItem("analytics_consent_status", "accepted");
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

  it("does not emit frontend tracking when consent is unknown", async () => {
    window.localStorage.removeItem("analytics_consent_status");

    await trackEvent({ eventName: "page_view" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not emit frontend tracking when consent is denied", async () => {
    window.localStorage.setItem("analytics_consent_status", "denied");

    await trackEvent({ eventName: "page_view" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not persist first-touch utm before consent", () => {
    window.localStorage.removeItem("analytics_consent_status");
    window.history.replaceState(
      {},
      "",
      "/?utm_source=linkedin&utm_medium=dm&utm_campaign=launch",
    );

    const firstTouch = captureAndPersistUtmParams();

    expect(firstTouch).toMatchObject({
      utm_source: "linkedin",
      utm_medium: "dm",
      utm_campaign: "launch",
    });
    expect(window.localStorage.getItem("analytics_first_touch_utm")).toBeNull();
  });

  it("includes only safe route metadata and persisted utm on page_view payload", async () => {
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
      pathname: "/",
      url: "/",
      search: null,
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
      page_location: "/adaptar",
      page_path: "/adaptar",
      page_referrer: null,
    });
  });

  it("builds analytics base properties with current route context", () => {
    window.history.replaceState({}, "", "/adaptar");
    sessionStorage.setItem("analytics_posthog_session_id", "ph-session-123");

    const base = getAnalyticsBaseProperties();
    expect(base).toMatchObject({
      route: "/adaptar",
      pathname: "/adaptar",
      url: "/adaptar",
      search: null,
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

  it("removes prohibited nested fields from event metadata", async () => {
    await trackEvent({
      eventName: "analysis_started",
      properties: {
        cv: "raw cv",
        nested: {
          email: "user@example.com",
          body: { rawPayload: "sensitive" },
          safe: true,
        },
        fileType: "pdf",
      },
    });

    const [, options] = fetchMock.mock.calls[0] ?? [];
    const payload = JSON.parse(String(options?.body ?? "{}"));

    expect(payload.metadata.cv).toBeUndefined();
    expect(payload.metadata.nested?.email).toBeUndefined();
    expect(payload.metadata.nested?.body).toBeUndefined();
    expect(payload.metadata.nested?.safe).toBe(true);
    expect(payload.metadata.fileType).toBe("pdf");
  });
});
