import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BrickCheckoutClientPage } from "./page.client";

const mockGetBrickCheckoutClient = vi.fn();
const mockSubmitBrickPaymentClient = vi.fn();
const mockTrackEvent = vi.fn();
const mockCreateBrick = vi.fn();

vi.mock("@/lib/payments-browser-api", () => ({
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
    mockSubmitBrickPaymentClient.mockReset();
    mockTrackEvent.mockReset();
    mockCreateBrick.mockReset();

    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY = "pk_test_123";
    process.env.NEXT_PUBLIC_APP_ENV = "development";
    process.env.NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED = "false";

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
  });

  afterEach(() => {
    cleanup();
    delete window.MercadoPago;
    delete process.env.NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED;
  });

  it("shows loading before data is resolved", () => {
    mockGetBrickCheckoutClient.mockImplementation(
      () => new Promise(() => undefined),
    );

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    expect(screen.getByTestId("brick-checkout-loading")).toBeTruthy();
  });

  it("enables local dry-run mode when explicit degraded flag is true", async () => {
    process.env.NEXT_PUBLIC_PAYMENT_BRICK_LOCAL_DEGRADED = "true";

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
      expect(screen.getByTestId("brick-dryrun-fallback-btn")).toBeTruthy();
    });
    expect(mockCreateBrick).toHaveBeenCalledTimes(0);
  });

  it("shows checkout summary when backend returns valid data", async () => {
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
    });

    expect(screen.getByText("Finalizar pagamento")).toBeTruthy();
    expect(screen.getByText("EarlyCV - pacote Starter")).toBeTruthy();
    expect(screen.getByText("Status: pending")).toBeTruthy();
    expect(
      screen.getByText("Pagamento via Mercado Pago sera carregado aqui."),
    ).toBeTruthy();
    await waitFor(() => {
      expect(mockCreateBrick).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId("payment-brick-container")).toBeTruthy();
  });

  it("onSubmit calls backend endpoint and shows dry-run feedback", async () => {
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
      dryRun: true,
      purchaseId: "purchase-1",
      status: "validated",
      checkoutMode: "brick",
      message: "Brick payload validated. No Mercado Pago payment was created.",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    await capturedOnSubmit?.({ token: "sensitive-token" });

    expect(mockSubmitBrickPaymentClient).toHaveBeenCalledWith("purchase-1", {
      token: "sensitive-token",
    });
    await waitFor(() => {
      expect(screen.getByTestId("brick-dryrun-message")).toBeTruthy();
    });
  });

  it("shows friendly error when onSubmit fails", async () => {
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
    mockSubmitBrickPaymentClient.mockRejectedValue(new Error("fail"));

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnSubmit).toBeTruthy();
    });

    await expect(capturedOnSubmit?.({ id: "x" })).rejects.toThrow(
      "submit_failed",
    );

    await waitFor(() => {
      expect(screen.getByTestId("brick-submit-error")).toBeTruthy();
    });
  });

  it("shows dry-run fallback button when brick returns no payment type selected", async () => {
    let capturedOnError: ((payload: unknown) => void) | null = null;
    mockCreateBrick.mockImplementation(
      async (
        _type: string,
        _container: string,
        settings: {
          callbacks?: { onError?: (payload: unknown) => void };
        },
      ) => {
        capturedOnError = settings.callbacks?.onError ?? null;
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
      dryRun: true,
      purchaseId: "purchase-1",
      status: "validated",
      checkoutMode: "brick",
      message: "Brick payload validated. No Mercado Pago payment was created.",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(capturedOnError).toBeTruthy();
    });

    capturedOnError?.({ message: "No payment type was selected" });

    await waitFor(() => {
      expect(screen.getByTestId("brick-dryrun-fallback-btn")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("brick-dryrun-fallback-btn"));

    await waitFor(() => {
      expect(screen.getByTestId("brick-dryrun-message")).toBeTruthy();
    });
  });

  it("shows friendly error when backend returns error", async () => {
    mockGetBrickCheckoutClient.mockRejectedValue(
      Object.assign(new Error("not found"), { status: 404 }),
    );

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brick-checkout-error")).toBeTruthy();
    });
    expect(screen.getByText(/Compra nao encontrada/i)).toBeTruthy();
  });

  it("does not render Brick when public key is missing and shows technical error in dev", async () => {
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY = "";
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
      expect(screen.getByTestId("brick-checkout-error")).toBeTruthy();
    });
    expect(screen.getByText(/Public key Mercado Pago ausente/i)).toBeTruthy();
    expect(mockCreateBrick).toHaveBeenCalledTimes(0);
  });

  it("does not render Brick when status is not pending", async () => {
    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 11.9,
      currency: "BRL",
      description: "EarlyCV - pacote Starter",
      status: "none" as unknown as "pending",
      originAction: "buy_credits",
      originAdaptationId: null,
      payerEmail: "user@example.com",
      checkoutMode: "brick",
    });

    render(<BrickCheckoutClientPage purchaseId="purchase-1" />);

    await waitFor(() => {
      expect(screen.getByTestId("brick-checkout-error")).toBeTruthy();
    });
    expect(screen.getByText(/Status invalido para checkout: none/i)).toBeTruthy();
    expect(mockCreateBrick).toHaveBeenCalledTimes(0);
  });

  it("does not render Brick when amount is invalid", async () => {
    mockGetBrickCheckoutClient.mockResolvedValue({
      purchaseId: "purchase-1",
      amount: 0,
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
      expect(screen.getByTestId("brick-checkout-error")).toBeTruthy();
    });
    expect(screen.getByText(/Amount invalido/i)).toBeTruthy();
    expect(mockCreateBrick).toHaveBeenCalledTimes(0);
  });

  it("shows generic friendly error in production", async () => {
    process.env.NEXT_PUBLIC_APP_ENV = "production";
    process.env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY = "";
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
      expect(screen.getByTestId("brick-checkout-error")).toBeTruthy();
    });
    expect(
      screen.getByText(
        "Nao foi possivel carregar este checkout. Verifique sua compra e tente novamente.",
      ),
    ).toBeTruthy();
  });
});
    Object.defineProperty(window, "location", {
      value: {
        hostname: "example.com",
      },
      writable: true,
    });
