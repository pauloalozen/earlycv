import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/adaptar"));
const useSearchParamsMock = vi.hoisted(
  () => vi.fn(() => new URLSearchParams()),
);

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

import Template from "./template";

describe("Template journey tracking", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/adaptar");
    useSearchParamsMock.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it("emits page_view and session_started on first eligible route", async () => {
    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(names).toContain("page_view");
      expect(names).toContain("session_started");
    });
  });

  it("does not emit journey events for admin routes", async () => {
    usePathnameMock.mockReturnValue("/admin");

    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    await waitFor(() => {
      expect(trackEventMock).not.toHaveBeenCalled();
    });
  });

  it("emits session_engaged once on first interaction", async () => {
    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    window.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await waitFor(() => {
      const engagedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_engaged",
      );
      expect(engagedCalls).toHaveLength(1);
    });
  });

  it("emits page_leave when pagehide fires", async () => {
    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(names).toContain("page_leave");
      expect(names).toContain("site_exit_candidate");
    });
  });

  it("does not emit site_exit_candidate on internal route change", async () => {
    usePathnameMock.mockReturnValue("/entrar");

    const first = render(
      <Template>
        <div>entrar</div>
      </Template>,
    );

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(names).toContain("page_view");
    });

    first.unmount();
    usePathnameMock.mockReturnValue("/dashboard");

    render(
      <Template>
        <div>dashboard</div>
      </Template>,
    );

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(names).toContain("page_leave");
      expect(names).not.toContain("site_exit");
      expect(names).not.toContain("site_exit_candidate");
    });
  });

  it("emits a single page_leave per route change", async () => {
    usePathnameMock.mockReturnValue("/");
    const first = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      const pageViews = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );
      expect(pageViews.length).toBeGreaterThan(0);
    });

    first.unmount();
    usePathnameMock.mockReturnValue("/entrar");
    render(
      <Template>
        <div>entrar</div>
      </Template>,
    );

    await waitFor(() => {
      const leaves = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_leave",
      );
      expect(leaves).toHaveLength(1);
    });
  });

  it("uses different routeVisitId per route while keeping sessionInternalId", async () => {
    usePathnameMock.mockReturnValue("/");
    const first = render(
      <Template>
        <div>home</div>
      </Template>,
    );

    await waitFor(() => {
      const pageViews = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );
      expect(pageViews.length).toBeGreaterThan(0);
    });

    const firstView = trackEventMock.mock.calls.find(
      ([payload]) => payload.eventName === "page_view",
    )?.[0];

    first.unmount();
    usePathnameMock.mockReturnValue("/entrar");
    render(
      <Template>
        <div>entrar</div>
      </Template>,
    );

    await waitFor(() => {
      const pageViews = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "page_view",
      );
      expect(pageViews.length).toBeGreaterThan(1);
    });

    const secondView = trackEventMock.mock.calls
      .filter(([payload]) => payload.eventName === "page_view")
      .at(-1)?.[0];

    expect(firstView?.properties?.routeVisitId).not.toBe(
      secondView?.properties?.routeVisitId,
    );
    expect(firstView?.properties?.sessionInternalId).toBe(
      secondView?.properties?.sessionInternalId,
    );
  });

  it("does not duplicate navigation events in strict mode mount cycle", async () => {
    usePathnameMock.mockReturnValue("/");

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

  it("emits checkout_abandoned once after checkout intent stabilization", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));

    const first = render(
      <Template>
        <form
          action="/plans/checkout"
          method="post"
          data-testid="checkout-form"
        >
          <input type="hidden" name="planId" value="pro" />
          <button type="submit">Comprar</button>
        </form>
      </Template>,
    );

    const checkoutForm = first.getByTestId("checkout-form");
    fireEvent.submit(checkoutForm);

    expect(
      trackEventMock.mock.calls.some(
        ([payload]) => payload.eventName === "plan_selected",
      ),
    ).toBe(true);
    expect(
      trackEventMock.mock.calls.some(
        ([payload]) => payload.eventName === "checkout_started",
      ),
    ).toBe(true);

    const planSelectedCalls = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "plan_selected",
    );
    const checkoutStartedCalls = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "checkout_started",
    );
    expect(planSelectedCalls).toHaveLength(1);
    expect(checkoutStartedCalls).toHaveLength(1);

    first.unmount();
    vi.advanceTimersByTime(61_000);

    render(
      <Template>
        <div>after-return</div>
      </Template>,
    );

    await Promise.resolve();

    const abandonedCalls = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "checkout_abandoned",
    );
    expect(abandonedCalls).toHaveLength(1);
  });

  it("does not emit checkout_abandoned before stabilization window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-22T12:00:00.000Z"));

    const first = render(
      <Template>
        <form
          action="/plans/checkout"
          method="post"
          data-testid="checkout-form-fast"
        >
          <input type="hidden" name="planId" value="pro" />
          <button type="submit">Comprar</button>
        </form>
      </Template>,
    );

    const checkoutForm = first.getByTestId("checkout-form-fast");
    fireEvent.submit(checkoutForm);

    first.unmount();
    vi.advanceTimersByTime(59_000);

    render(
      <Template>
        <div>after-return-fast</div>
      </Template>,
    );

    await Promise.resolve();

    const abandonedCalls = trackEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "checkout_abandoned",
    );
    expect(abandonedCalls).toHaveLength(0);
  });
});
