import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrickCheckoutClientPage } from "./page.client";

const mockGetBrickCheckoutClient = vi.fn();
const mockGetCheckoutStatusClient = vi.fn();
const mockSubmitBrickPaymentClient = vi.fn();
const mockTrackEvent = vi.fn();
const mockCreateBrick = vi.fn();
const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/lib/payments-browser-api", () => ({
  getCheckoutStatusClient: (...args: unknown[]) =>
    mockGetCheckoutStatusClient(...args),
  getBrickCheckoutClient: (...args: unknown[]) =>
    mockGetBrickCheckoutClient(...args),
  submitBrickPaymentClient: (...args: unknown[]) =>
    mockSubmitBrickPaymentClient(...args),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));

describe("BrickCheckoutClientPage", () => {
  beforeEach(() => {
    mockGetBrickCheckoutClient.mockReset();
    mockGetCheckoutStatusClient.mockReset();
    mockSubmitBrickPaymentClient.mockReset();
    mockTrackEvent.mockReset();
    mockCreateBrick.mockReset();
    mockPush.mockReset();

    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY = "pk_test_123";
    process.env.NEXT_PUBLIC_MERCADOPAGO_BRICK_PUBLIC_KEY = "pk_brick_123";
    process.env.NEXT_PUBLIC_APP_ENV = "development";

    document.body.innerHTML = "";
    const sdkScript = document.createElement("script");
    sdkScript.id = "mercadopago-sdk";
    document.body.appendChild(sdkScript);

    function MercadoPagoMock() {
      return {
        bricks: () => ({
          create: mockCreateBrick,
        }),
      };
    }

    window.MercadoPago = MercadoPagoMock as unknown as typeof window.MercadoPago;
    mockCreateBrick.mockResolvedValue({ unmount: vi.fn() });
    mockGetCheckoutStatusClient.mockResolvedValue({ status: "pending" });
  });

  afterEach(() => {
    cleanup();
    delete window.MercadoPago;
  });

  it("renders checkout summary and creates payment brick", async () => {
    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brick-checkout-summary")).toBeTruthy();
      expect(mockCreateBrick).toHaveBeenCalledTimes(1);
    });

    const thirdArg = mockCreateBrick.mock.calls[0]?.[2] as {
      customization?: {
        paymentMethods?: Record<string, string>;
      };
    };
    expect(thirdArg.customization?.paymentMethods).toMatchObject({
      creditCard: "all",
      bankTransfer: "all",
    });
  });

  it("renders legal links in checkout context", async () => {
    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    expect(
      await screen.findByRole("link", { name: /pol[ií]tica de privacidade/i }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: /termos de uso/i })).toBeTruthy();
  });

  it("redirects to concluded path when submit returns approved", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "approved",
      checkoutMode: "brick",
      redirectTo: "/pagamento/concluido?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });
    await capturedOnSubmit?.({ token: "tok" });

    expect(mockPush).toHaveBeenCalledWith(
      "/pagamento/concluido?checkoutId=purchase-1",
    );
  });

  it("shows safe error when submit fails", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockRejectedValue(new Error("failed"));

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    await expect(capturedOnSubmit?.({ token: "tok" })).rejects.toThrow(
      "submit_failed",
    );
    await waitFor(() => {
      expect(screen.getByTestId("brick-submit-error")).toBeTruthy();
      expect(
        screen.queryByText("Pagamento via Mercado Pago sera carregado aqui."),
      ).toBeNull();
    });
  });

  it("sends formData to API when Brick submit payload is wrapped", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    const formDataPayload = {
      payment_method_id: "pix",
      payer: { email: "user@example.com" },
    };
    await capturedOnSubmit?.({
      selectedPaymentMethod: "pix",
      formData: formDataPayload,
    });

    expect(mockSubmitBrickPaymentClient).toHaveBeenCalledWith(
      "purchase-1",
      formDataPayload,
    );
  });

  it("normalizes wrapped pix payload and injects fallback payer email", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "fallback@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    await capturedOnSubmit?.({
      selectedPaymentMethod: "pix",
      formData: {
        payer: {},
      },
    });

    expect(mockSubmitBrickPaymentClient).toHaveBeenCalledWith(
      "purchase-1",
      expect.objectContaining({
        payment_method_id: "pix",
        payer: { email: "fallback@example.com" },
      }),
    );
  });

  it("injects fallback payer email for credit card when missing", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "fallback@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    await capturedOnSubmit?.({
      selectedPaymentMethod: "credit_card",
      formData: {
        payment_method_id: "visa",
        token: "tok_123",
        installments: 1,
        payer: {},
      },
    });

    expect(mockSubmitBrickPaymentClient).toHaveBeenCalledWith(
      "purchase-1",
      expect.objectContaining({
        payment_method_id: "visa",
        payer: { email: "fallback@example.com" },
      }),
    );
  });

  it("keeps user on page and shows pix pending data", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: "data:image/png;base64,abc",
      qrCodeText: "000201010212...",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });
    await capturedOnSubmit?.({
      selectedPaymentMethod: "pix",
      formData: { payment_method_id: "pix", payer: { email: "user@example.com" } },
    });

    await waitFor(() => {
      expect(screen.getByTestId("pix-pending-panel")).toBeTruthy();
      expect(screen.getByTestId("pix-copy-code").textContent).toContain("000201010212");
    });
    expect(screen.getByTestId("payment-brick-container").className).toContain(
      "pointer-events-none",
    );
    const qrImage = screen.getByAltText("QR Code PIX") as HTMLImageElement;
    expect(qrImage.src).toContain("data:image/png;base64,abc");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps user on page and shows processing panel for pending card payment", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });
    await capturedOnSubmit?.({
      selectedPaymentMethod: "credit_card",
      formData: {
        payment_method_id: "visa",
        token: "tok_123",
        installments: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("payment-processing-panel")).toBeTruthy();
    });
    expect(screen.queryByTestId("pix-pending-panel")).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("stops processing state and shows failure when polling returns failed", async () => {
    let capturedOnSubmit: ((payload: unknown) => Promise<void>) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onSubmit?: (payload: unknown) => Promise<void> };
        },
      ) => {
        capturedOnSubmit = settings.callbacks?.onSubmit ?? null;
        return { unmount: vi.fn() };
      },
    );

    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });
    mockSubmitBrickPaymentClient.mockResolvedValue({
      purchaseId: "purchase-1",
      status: "pending",
      checkoutMode: "brick",
      redirectTo: "/pagamento/pendente?checkoutId=purchase-1",
      qrCodeBase64: null,
      qrCodeText: null,
    });
    mockGetCheckoutStatusClient.mockResolvedValue({
      checkoutId: "purchase-1",
      status: "failed",
      nextAction: "show_failure",
      type: "plan",
      planPurchased: "starter",
      planName: "Starter",
      creditsGranted: 10,
      analysisCreditsGranted: 0,
      adaptationId: null,
      originAction: "buy_credits",
      originAdaptationId: null,
      autoUnlockProcessedAt: null,
      autoUnlockError: null,
      adaptationUnlocked: false,
      paymentId: null,
      message: "Pagamento recusado. Verifique os dados ou tente outro meio de pagamento.",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });
    await capturedOnSubmit?.({
      selectedPaymentMethod: "credit_card",
      formData: {
        payment_method_id: "visa",
        token: "tok_123",
        installments: 1,
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("payment-processing-panel")).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.queryByTestId("payment-processing-panel")).toBeNull();
      expect(screen.getByTestId("brick-submit-error").textContent).toContain(
        "Pagamento recusado",
      );
    }, { timeout: 7000 });
  }, 12000);
});
