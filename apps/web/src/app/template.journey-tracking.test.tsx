import { cleanup, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/"));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

import Template from "./template";

describe("Template journey tracking strict mode", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/");
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("does not duplicate navigation events in strict mode mount cycle", async () => {
    render(
      <StrictMode>
        <Template>
          <div>child</div>
        </Template>
      </StrictMode>,
    );

    await waitFor(() => {
      const navEvents = trackEventMock.mock.calls
        .map(([payload]) => payload.eventName)
        .filter((name) => name === "page_view" || name === "page_leave");

      expect(navEvents).toEqual(["page_view"]);
    });
  });

  it("emits leave for previous route on remount navigation", async () => {
    usePathnameMock.mockReturnValue("/");

    const firstRender = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      const views = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );

      expect(views.length).toBeGreaterThan(0);
      expect(views[0]?.[0]?.properties?.route).toBe("/");
    });

    firstRender.unmount();
    usePathnameMock.mockReturnValue("/adaptar");

    render(
      <Template>
        <div>adaptar</div>
      </Template>,
    );

    await waitFor(() => {
      const leaves = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_leave",
      );
      const views = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );

      expect(
        leaves.some(([payload]) => payload.properties?.route === "/"),
      ).toBe(true);
      expect(
        views.some(([payload]) => payload.properties?.route === "/adaptar"),
      ).toBe(true);
      const exitEvents = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "site_exit",
      );
      expect(exitEvents).toHaveLength(0);
    });
  });

  it("emits site_exit on pagehide", async () => {
    render(
      <Template>
        <div>home</div>
      </Template>,
    );

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const exits = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "site_exit",
      );

      expect(exits.length).toBeGreaterThan(0);
      expect(exits[0]?.[0]?.properties?.route).toBe("/");
    });
  });

  it("emits only one site_exit per session", async () => {
    render(
      <Template>
        <div>home</div>
      </Template>,
    );

    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const exits = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "site_exit",
      );

      expect(exits).toHaveLength(1);
    });
  });
});
