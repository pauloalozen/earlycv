import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PagamentoConcluido from "./page";

const mockUseSearchParams = vi.fn();
const mockGetCheckoutStatusClient = vi.fn();
const trackEventMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/payments-browser-api", () => ({
  getCheckoutStatusClient: (...args: unknown[]) =>
    mockGetCheckoutStatusClient(...args),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

describe("PagamentoConcluido", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "checkoutId") return "chk-2";
        if (key === "payment_id") return "pay-2";
        if (key === "status") return "approved";
        return null;
      },
    });
    mockGetCheckoutStatusClient.mockResolvedValue({
      nextAction: "show_success",
      message: "ok",
      type: "plan",
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("emits payment_return_viewed with checkout context", async () => {
    render(<PagamentoConcluido />);

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "payment_return_viewed",
          properties: expect.objectContaining({
            checkoutId: "chk-2",
            paymentId: "pay-2",
            source_detail: "pagamento_concluido",
            status: "approved",
          }),
        }),
      );
    });
  });
});
