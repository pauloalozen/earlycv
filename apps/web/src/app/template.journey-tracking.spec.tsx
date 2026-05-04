import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/adaptar"));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
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
    });
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
