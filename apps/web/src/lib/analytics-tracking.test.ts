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
    window.localStorage.removeItem("analytics_first_touch_utm");
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

    const base = getAnalyticsBaseProperties();
    expect(base).toMatchObject({
      route: "/adaptar",
      url: `${window.location.origin}/adaptar`,
      search: "",
      source: "web",
      app: "earlycv",
    });
  });
});
