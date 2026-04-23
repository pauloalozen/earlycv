import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const emitBusinessFunnelEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/adaptar"));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  emitBusinessFunnelEvent: emitBusinessFunnelEventMock,
}));

import Template from "./template";

describe("Template journey tracking", () => {
  beforeEach(() => {
    emitBusinessFunnelEventMock.mockReset();
    emitBusinessFunnelEventMock.mockResolvedValue(undefined);
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
      const names = emitBusinessFunnelEventMock.mock.calls.map(
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
      expect(emitBusinessFunnelEventMock).not.toHaveBeenCalled();
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
      const engagedCalls = emitBusinessFunnelEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_engaged",
      );
      expect(engagedCalls).toHaveLength(1);
    });
  });

  it("emits page_leave when component unmounts", async () => {
    const { unmount } = render(
      <Template>
        <div>child</div>
      </Template>,
    );

    unmount();

    await waitFor(() => {
      const names = emitBusinessFunnelEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );
      expect(names).toContain("page_leave");
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

    const abandonedCalls = emitBusinessFunnelEventMock.mock.calls.filter(
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

    const abandonedCalls = emitBusinessFunnelEventMock.mock.calls.filter(
      ([payload]) => payload.eventName === "checkout_abandoned",
    );
    expect(abandonedCalls).toHaveLength(0);
  });
});
