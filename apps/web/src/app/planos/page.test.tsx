import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PlanosPage from "./page";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const useRouterMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

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
    getCurrentAppUserFromCookiesMock.mockResolvedValue({
      id: "user-1",
      name: "Alo",
    });
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
});
