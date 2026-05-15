import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanosPage from "./page";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const useRouterMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const openMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div>Header</div>,
}));

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  getCvAdaptationContent: vi.fn(),
}));

vi.mock("@/lib/dashboard-test-metrics", () => ({
  extractDashboardAnalysisSignal: vi.fn(() => ({
    adjustments: { scoreBefore: null, scoreFinal: null },
  })),
}));

vi.mock("./score-indicator", () => ({
  ScoreIndicator: () => <div>ScoreIndicator</div>,
}));

describe("PlanosPage checkout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useRouterMock.mockReturnValue({ push: pushMock });
    pushMock.mockReset();
    openMock.mockReset();
    vi.stubGlobal("open", openMock);
    getCurrentAppUserFromCookiesMock.mockResolvedValue({
      id: "user-1",
      name: "Alo",
    });
    process.env.PRICE_PLAN_STARTER = "1190";
    process.env.PRICE_PLAN_PRO = "2990";
    process.env.PRICE_PLAN_TURBO = "5990";
    process.env.QNT_CV_PLAN_STARTER = "3";
    process.env.QNT_CV_PLAN_PRO = "10";
    process.env.QNT_CV_PLAN_TURBO = "20";
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function submitProPlanForm() {
    const planInput = document.querySelector(
      'input[name="planId"][value="pro"]',
    ) as HTMLInputElement | null;
    expect(planInput).toBeTruthy();
    const form = planInput?.closest("form");
    expect(form).toBeTruthy();
    const submitButton = form?.querySelector('button[type="submit"]');
    expect(submitButton).toBeTruthy();
    if (submitButton) {
      fireEvent.click(submitButton);
    }
  }

  it("redirects to internal checkout page for a successful checkout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          purchaseId: "purchase-123",
          checkoutMode: "brick",
        }),
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));
    submitProPlanForm();

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/pagamento/checkout/purchase-123");
    });
  });

  it("shows retry error when checkout request returns non-ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));
    submitProPlanForm();

    await waitFor(() => {
      const alert = document.querySelector('[role="alert"]');
      expect(alert?.textContent).toMatch(/erro ao iniciar pagamento/i);
    });
  });

  it("shows retry error when checkout payload has no purchaseId", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkoutUrl: "https://mp.test/legacy",
        }),
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));
    submitProPlanForm();

    await waitFor(() => {
      const alert = document.querySelector('[role="alert"]');
      expect(alert?.textContent).toMatch(/erro ao iniciar pagamento/i);
    });
  });

  it("opens legacy checkout in new tab and redirects current tab to pending", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          purchaseId: "purchase-legacy-123",
          checkoutUrl: "https://mp.test/legacy?preference_id=pref-123",
        }),
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));
    submitProPlanForm();

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        "https://mp.test/legacy?preference_id=pref-123",
        "_blank",
        "noopener,noreferrer",
      );
      expect(pushMock).toHaveBeenCalledWith(
        "/pagamento/pendente?checkoutId=purchase-legacy-123&preference_id=pref-123",
      );
    });
  });

  it("does not send adaptationId when source is resultado-buy-credits", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        purchaseId: "purchase-123",
        checkoutMode: "brick",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      await PlanosPage({
        searchParams: Promise.resolve({
          aid: "adapt-123",
          source: "resultado-buy-credits",
        }),
      }),
    );
    submitProPlanForm();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, requestInit] = fetchMock.mock.calls[0] as [
      string,
      { body?: string },
    ];
    const body = JSON.parse(String(requestInit?.body ?? "{}")) as {
      adaptationId?: string;
      planId?: string;
    };

    expect(body.planId).toBe("pro");
    expect(body.adaptationId).toBeUndefined();
  });

  it("renders legal links near critical purchase context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          purchaseId: "purchase-123",
          checkoutMode: "brick",
        }),
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole("link", { name: /pol[ií]tica de privacidade/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /termos de uso/i })).toBeTruthy();
  });
});
