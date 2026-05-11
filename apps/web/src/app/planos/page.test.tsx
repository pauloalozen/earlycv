import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

describe("PlanosPage checkout confirmation", () => {
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

  it("shows confirmation before opening Mercado Pago", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkoutUrl: "https://mp.test/checkout",
          purchaseId: "purchase-123",
        }),
      }),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));

    submitProPlanForm();

    await waitFor(() => {
      expect(
        screen.getByText(/voce sera redirecionado para o mercado pago/i),
      ).toBeTruthy();
      expect(screen.getByText(/apos pagar, volte ao earlycv/i)).toBeTruthy();
      expect(
        screen.getByText(
          /pagamentos por pix podem levar alguns minutos para confirmar/i,
        ),
      ).toBeTruthy();
    });

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement?.textContent).toMatch(
      /continuar para mercado pago/i,
    );
  });

  it("opens checkout in a new tab and redirects current tab after confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkoutUrl: "https://mp.test/checkout",
          purchaseId: "purchase-123",
        }),
      }),
    );
    const openMock = vi.spyOn(window, "open").mockImplementation(
      () => ({ closed: false } as Window),
    );

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));

    submitProPlanForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continuar para mercado pago/i }),
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /continuar para mercado pago/i }),
    );

    await waitFor(() => {
      expect(openMock).toHaveBeenCalledWith(
        "https://mp.test/checkout",
        "_blank",
        "noopener,noreferrer",
      );
      expect(pushMock).toHaveBeenCalledWith(
        "/pagamento/pendente?checkoutId=purchase-123",
      );
    });
  });

  it("continues to pending page even when window.open returns null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          checkoutUrl: "https://mp.test/checkout",
          purchaseId: "purchase-123",
        }),
      }),
    );
    vi.spyOn(window, "open").mockImplementation(() => null);

    render(await PlanosPage({ searchParams: Promise.resolve({}) }));

    submitProPlanForm();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /continuar para mercado pago/i }),
      ).toBeTruthy();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /continuar para mercado pago/i }),
    );

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(
        "/pagamento/pendente?checkoutId=purchase-123",
      );
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
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toMatch(/erro ao iniciar pagamento/i);
    });
  });
});
