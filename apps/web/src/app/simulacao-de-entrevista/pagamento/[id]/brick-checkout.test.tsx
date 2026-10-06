import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MockInterviewBrickCheckout } from "./brick-checkout";

const replaceMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock, push: pushMock }),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
}

describe("MockInterviewBrickCheckout", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    replaceMock.mockReset();
    pushMock.mockReset();
  });

  it("shows the order summary and the in-page payment area (no redirect to Mercado Pago)", async () => {
    mockFetch(200, {
      purchaseId: "cmpurchase000abc123",
      code: "ABC123",
      amount: 79.9,
      amountInCents: 7990,
      currency: "BRL",
      description: "Entrevista simulada ao vivo (45 min)",
      payerEmail: "maria@example.com",
    });
    render(<MockInterviewBrickCheckout purchaseId="cmpurchase000abc123" />);
    await waitFor(() =>
      expect(screen.getByTestId("mock-interview-checkout")).toBeTruthy(),
    );
    expect(screen.getByText("pedido #ABC123")).toBeTruthy();
    expect(screen.getByTestId("mock-interview-brick-container")).toBeTruthy();
    expect(screen.getByText(/R\$\s?79,90/)).toBeTruthy();
  });

  it("an order already paid or in progress goes straight to the order page", async () => {
    mockFetch(409, {
      errorCode: "purchase_status_invalid",
      orderPath: "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
    });
    render(<MockInterviewBrickCheckout purchaseId="cmpurchase000abc123" />);
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
      ),
    );
  });

  it("unknown order shows an error", async () => {
    mockFetch(404, { errorCode: "purchase_not_found" });
    render(<MockInterviewBrickCheckout purchaseId="nope" />);
    await waitFor(() =>
      expect(screen.getByText("Pedido não encontrado.")).toBeTruthy(),
    );
  });

  it("simulate payment button only shows when the API allows it, and goes to the order page", async () => {
    const checkout = {
      purchaseId: "cmpurchase000abc123",
      code: "ABC123",
      amount: 79.9,
      amountInCents: 7990,
      currency: "BRL",
      description: "Entrevista simulada ao vivo (45 min)",
      payerEmail: "maria@example.com",
    };
    mockFetch(200, checkout);
    render(<MockInterviewBrickCheckout purchaseId="cmpurchase000abc123" />);
    await waitFor(() =>
      expect(screen.getByTestId("mock-interview-checkout")).toBeTruthy(),
    );
    expect(screen.queryByTestId("mock-interview-simulate-payment")).toBeNull();
    cleanup();

    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith("/simulate-payment")
          ? {
              redirectTo: "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
            }
          : { ...checkout, canSimulatePayment: true },
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MockInterviewBrickCheckout purchaseId="cmpurchase000abc123" />);
    const button = await screen.findByRole("button", {
      name: /simular pagamento aprovado/i,
    });
    fireEvent.click(button);
    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith(
        "/simulacao-de-entrevista/pedido/cmpurchase000abc123",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/mock-interviews/purchases/cmpurchase000abc123/simulate-payment",
      { method: "POST" },
    );
  });
});
