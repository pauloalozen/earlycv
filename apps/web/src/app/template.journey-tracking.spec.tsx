import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/adaptar"));
const useSearchParamsMock = vi.hoisted(() =>
  vi.fn(() => new URLSearchParams()),
);
const firstTouchUtmState = vi.hoisted(() => ({
  value: {} as Record<string, string | undefined>,
}));
const captureAndPersistUtmParamsMock = vi.hoisted(() => vi.fn());
const waitForPosthogSessionIdMock = vi.hoisted(() => vi.fn());
const getPosthogSessionIdMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useSearchParams: useSearchParamsMock,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
  captureAndPersistUtmParams: captureAndPersistUtmParamsMock,
}));

vi.mock("@/lib/posthog-session", () => ({
  waitForPosthogSessionId: waitForPosthogSessionIdMock,
  getPosthogSessionId: getPosthogSessionIdMock,
  persistPosthogSessionId: vi.fn(),
}));

import Template from "./template";
import { __resetSessionStartedEmissionGuardForTests } from "@/lib/session-started-guard";

describe("Template journey tracking", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_KEY = "ph-test-key";
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    captureAndPersistUtmParamsMock.mockReset();
    firstTouchUtmState.value = {};
    captureAndPersistUtmParamsMock.mockImplementation(() => firstTouchUtmState.value);
    waitForPosthogSessionIdMock.mockReset();
    waitForPosthogSessionIdMock.mockResolvedValue("ph-session-1");
    getPosthogSessionIdMock.mockReset();
    getPosthogSessionIdMock.mockReturnValue("ph-session-1");
    usePathnameMock.mockReset();
    usePathnameMock.mockReturnValue("/adaptar");
    useSearchParamsMock.mockReset();
    useSearchParamsMock.mockReturnValue(new URLSearchParams());
    __resetSessionStartedEmissionGuardForTests();
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

  it("does not invent utm fields on page_leave when first-touch utm is missing", async () => {
    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const leave = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_leave",
      )?.[0];
      expect(leave).toBeDefined();
      expect(leave?.properties?.utm_source).toBeUndefined();
      expect(leave?.properties?.utm_medium).toBeUndefined();
      expect(leave?.properties?.utm_campaign).toBeUndefined();
      expect(leave?.properties?.utm_content).toBeUndefined();
      expect(leave?.properties?.utm_term).toBeUndefined();
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
    firstTouchUtmState.value = {
      utm_source: "smoke",
      utm_medium: "manual",
      utm_campaign: "session_started_fix",
      utm_content: "v1",
      utm_term: "validacao",
    };

    render(
      <Template>
        <div>child</div>
      </Template>,
    );

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const leave = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_leave",
      )?.[0];
      expect(leave).toBeDefined();
      expect(leave?.properties?.utm_source).toBe("smoke");
      expect(leave?.properties?.utm_medium).toBe("manual");
      expect(leave?.properties?.utm_campaign).toBe("session_started_fix");
      expect(leave?.properties?.utm_content).toBe("v1");
      expect(leave?.properties?.utm_term).toBe("validacao");

      const names = trackEventMock.mock.calls.map(([payload]) => payload.eventName);
      expect(names).not.toContain("site_exit_candidate");
    });
  });

  it("does not emit site_exit_candidate for auth redirect and emits auth_oauth_redirect_started", async () => {
    window.history.replaceState({}, "", "/entrar?tab=entrar");
    usePathnameMock.mockReturnValue("/entrar");
    useSearchParamsMock.mockReturnValue(new URLSearchParams("tab=entrar"));

    render(
      <Template>
        <a
          href="https://api.earlycv.local/auth/google/start?next=%2Fadaptar"
          data-testid="google-oauth"
        >
          Entrar com Google
        </a>
      </Template>,
    );

    const oauthLink = document.querySelector(
      '[data-testid="google-oauth"]',
    ) as HTMLAnchorElement;
    fireEvent.click(oauthLink);
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );

      expect(names).toContain("auth_oauth_redirect_started");
      expect(names).toContain("page_leave");
      expect(names).not.toContain("site_exit_candidate");
    });

    const authRedirectStarted = trackEventMock.mock.calls.find(
      ([payload]) => payload.eventName === "auth_oauth_redirect_started",
    )?.[0];
    const leave = trackEventMock.mock.calls.find(
      ([payload]) => payload.eventName === "page_leave",
    )?.[0];

    expect(authRedirectStarted?.properties?.provider).toBe("google");
    expect(authRedirectStarted?.properties?.source).toBe("frontend");
    expect(authRedirectStarted?.properties?.source_detail).toBe("login_google");
    expect(authRedirectStarted?.properties?.auth_flow).toBe("signin");
    expect(leave?.properties?.leave_reason).toBe("auth_redirect");
  });

  it("does not emit site_exit_candidate on email/password login submit and emits page_leave auth_submit", async () => {
    window.history.replaceState({}, "", "/entrar?tab=entrar&next=%2Fadaptar%2Fresultado");
    usePathnameMock.mockReturnValue("/entrar");
    useSearchParamsMock.mockReturnValue(
      new URLSearchParams("tab=entrar&next=%2Fadaptar%2Fresultado"),
    );

    render(
      <Template>
        <form action="/auth/login-user" method="post" data-testid="login-form">
          <input type="hidden" name="next" value="/adaptar/resultado" />
          <button type="submit">Entrar</button>
        </form>
      </Template>,
    );

    const loginForm = document.querySelector(
      '[data-testid="login-form"]',
    ) as HTMLFormElement;
    fireEvent.submit(loginForm);
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );

      expect(names).toContain("page_leave");
      expect(names).not.toContain("site_exit_candidate");
    });

    const leave = trackEventMock.mock.calls.find(
      ([payload]) => payload.eventName === "page_leave",
    )?.[0];

    expect(leave?.properties?.leave_reason).toBe("auth_submit");
    expect(leave?.properties?.next_route).toBe("/adaptar/resultado");
  });

  it("uses route_change with next route on internal navigation followed by pagehide", async () => {
    firstTouchUtmState.value = {
      utm_source: "smoke",
      utm_medium: "manual",
      utm_campaign: "session_started_fix",
      utm_content: "v1",
      utm_term: "validacao",
    };

    window.history.replaceState({}, "", "/adaptar/resultado");
    usePathnameMock.mockReturnValue("/adaptar/resultado");

    render(
      <Template>
        <a href="/planos" data-testid="go-planos">
          Ver planos
        </a>
      </Template>,
    );

    const planosLink = document.querySelector(
      '[data-testid="go-planos"]',
    ) as HTMLAnchorElement;
    fireEvent.click(planosLink);
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const leave = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_leave",
      )?.[0];

      expect(leave?.properties?.leave_reason).toBe("route_change");
      expect(leave?.properties?.next_route).toBe("/planos");
      expect(leave?.properties?.next_pathname).toBe("/planos");
      expect(leave?.properties?.next_url).toBe(
        `${window.location.origin}/planos`,
      );
      expect(leave?.properties?.utm_source).toBe("smoke");
      expect(leave?.properties?.utm_medium).toBe("manual");
      expect(leave?.properties?.utm_campaign).toBe("session_started_fix");
      expect(leave?.properties?.utm_content).toBe("v1");
      expect(leave?.properties?.utm_term).toBe("validacao");
    });
  });

  it("emits page_leave with current auth context and immutable route snapshot", async () => {
    usePathnameMock.mockReturnValue("/entrar");
    render(
      <Template>
        <div>entrar</div>
      </Template>,
    );

    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({ isAuthenticated: true, userId: "user-auth-1" }),
    );

    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const leave = trackEventMock.mock.calls.find(
        ([payload]) => payload.eventName === "page_leave",
      )?.[0];
      expect(leave?.properties?.route).toBe("/entrar");
      expect(leave?.properties?.pathname).toBe("/entrar");
      expect(leave?.properties?.isAuthenticated).toBe(true);
      expect(leave?.properties?.userId).toBe("user-auth-1");
      expect(leave?.properties?.user_id).toBe("user-auth-1");
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

  it("emits session_started only once for same posthog session across routes", async () => {
    usePathnameMock.mockReturnValue("/demo-resultado");
    const first = render(
      <Template>
        <div>demo</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
    });

    first.unmount();

    usePathnameMock.mockReturnValue("/entrar");
    const second = render(
      <Template>
        <div>entrar</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
    });

    second.unmount();
    usePathnameMock.mockReturnValue("/adaptar");
    render(
      <Template>
        <div>adaptar</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
    });
  });

  it("emits new session_started when posthog session id changes", async () => {
    const { rerender } = render(
      <Template>
        <div>child</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
    });

    waitForPosthogSessionIdMock.mockResolvedValue("ph-session-2");
    getPosthogSessionIdMock.mockReturnValue("ph-session-2");
    usePathnameMock.mockReturnValue("/adaptar/resultado");

    rerender(
      <Template>
        <div>child</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(2);
    });
  });

  it("does not emit new session_started when sessionInternalId changes but posthog session id is same", async () => {
    const first = render(
      <Template>
        <div>child</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
    });

    first.unmount();
    sessionStorage.removeItem("journey_session_internal_id");
    usePathnameMock.mockReturnValue("/adaptar");

    render(
      <Template>
        <div>child-2</div>
      </Template>,
    );

    await waitFor(() => {
      const startedCalls = trackEventMock.mock.calls.filter(
        ([payload]) => payload.eventName === "session_started",
      );
      expect(startedCalls).toHaveLength(1);
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
          <input type="hidden" name="planName" value="Pro" />
          <input type="hidden" name="planCredits" value="9" />
          <input type="hidden" name="planPrice" value="29.90" />
          <input type="hidden" name="planCurrency" value="BRL" />
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
    expect(planSelectedCalls[0]?.[0]?.properties).toMatchObject({
      planId: "pro",
      amount: 29.9,
      credits: 9,
      currency: "BRL",
      provider: "mercado_pago",
      source: "frontend",
    });
    expect(checkoutStartedCalls[0]?.[0]?.properties).toMatchObject({
      planId: "pro",
      amount: 29.9,
      credits: 9,
      currency: "BRL",
      provider: "mercado_pago",
      source: "frontend",
    });

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
    expect(abandonedCalls[0]?.[0]?.properties).toMatchObject({
      route: "/adaptar",
      checkoutOriginRoute: "/adaptar",
      checkoutOriginPathname: expect.stringContaining("/adaptar"),
      checkoutOriginRouteVisitId: expect.stringMatching(/^\/adaptar::/),
      routeVisitId: expect.stringMatching(/^\/adaptar::/),
    });
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
          <input type="hidden" name="planName" value="Pro" />
          <input type="hidden" name="planCredits" value="9" />
          <input type="hidden" name="planPrice" value="29.90" />
          <input type="hidden" name="planCurrency" value="BRL" />
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

  it("does not emit site_exit_candidate on checkout submit and emits checkout_redirect leave", async () => {
    usePathnameMock.mockReturnValue("/planos");
    window.history.replaceState({}, "", "/planos");
    sessionStorage.setItem(
      "analytics_auth_context",
      JSON.stringify({ isAuthenticated: true, userId: "user-checkout-1" }),
    );

    render(
      <Template>
        <form action="/plans/checkout" method="post" data-testid="checkout-redirect-form">
          <input type="hidden" name="planId" value="starter" />
          <input type="hidden" name="planName" value="Starter" />
          <input type="hidden" name="planCredits" value="3" />
          <input type="hidden" name="planPrice" value="11.90" />
          <input type="hidden" name="planCurrency" value="BRL" />
          <button type="submit">Checkout</button>
        </form>
      </Template>,
    );

    const checkoutForm = document.querySelector(
      '[data-testid="checkout-redirect-form"]',
    ) as HTMLFormElement;
    fireEvent.submit(checkoutForm);
    window.dispatchEvent(new Event("beforeunload"));
    window.dispatchEvent(new Event("pagehide"));

    await waitFor(() => {
      const names = trackEventMock.mock.calls.map(
        ([payload]) => payload.eventName,
      );

      expect(names).toContain("checkout_started");
      expect(names).toContain("page_leave");
      expect(names).not.toContain("site_exit_candidate");
    });

    const leave = trackEventMock.mock.calls.find(
      ([payload]) => payload.eventName === "page_leave",
    )?.[0];

    expect(leave?.properties?.leave_reason).toBe("checkout_redirect");
    expect(leave?.properties?.planId).toBe("starter");
    expect(leave?.properties?.planName).toBe("Starter");
    expect(leave?.properties?.amount).toBe(11.9);
    expect(leave?.properties?.credits).toBe(3);
    expect(leave?.properties?.currency).toBe("BRL");
    expect(leave?.properties?.provider).toBe("mercado_pago");
  });
});
