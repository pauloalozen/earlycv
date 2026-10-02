import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  formatMockInterviewAmount,
  formatMockInterviewPrice,
  toSchemaPrice,
} from "@/lib/mock-interview-offer";
import {
  type MockInterviewPurchaseView,
  resolveCheckoutOrigin,
} from "@/lib/mock-interviews-types";
import { OrderStatus } from "./order-status";

const base: MockInterviewPurchaseView = {
  id: "cmpurchase000abc123",
  code: "ABC123",
  amountInCents: 7990,
  currency: "BRL",
  paymentStatus: "pending",
  sessionStatus: "AWAITING_SCHEDULING",
  scheduledAt: null,
  meetingUrl: null,
  createdAt: "2026-10-01T12:00:00.000Z",
  paidAt: null,
  whatsappUrl: null,
  whatsappConfigured: true,
};

describe("OrderStatus", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("pending order: waits for confirmation and never shows the WhatsApp button", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<OrderStatus canBuy initial={base} returnHint={null} />);
    expect(
      screen.getByText("Aguardando a confirmação do pagamento."),
    ).toBeTruthy();
    expect(screen.queryByText("Chamar o Paulo no WhatsApp")).toBeNull();
  });

  it("paid order: shows the WhatsApp button with the order link", () => {
    render(
      <OrderStatus
        canBuy
        initial={{
          ...base,
          paymentStatus: "paid",
          paidAt: "2026-10-01T12:05:00.000Z",
          whatsappUrl: "https://wa.me/5511999990000?text=Pedido%20%23ABC123",
        }}
        returnHint={null}
      />,
    );
    const link = screen.getByText("Chamar o Paulo no WhatsApp").closest("a");
    expect(link?.getAttribute("href")).toBe(
      "https://wa.me/5511999990000?text=Pedido%20%23ABC123",
    );
    expect(screen.getByText("PEDIDO #ABC123")).toBeTruthy();
  });

  it("scheduled order: shows when and the Meet link", () => {
    render(
      <OrderStatus
        canBuy
        initial={{
          ...base,
          paymentStatus: "paid",
          sessionStatus: "SCHEDULED",
          scheduledAt: "2026-10-12T22:00:00.000Z",
          meetingUrl: "https://meet.google.com/abc-defg-hij",
          whatsappUrl: "https://wa.me/5511999990000",
        }}
        returnHint={null}
      />,
    );
    expect(
      screen
        .getByText("Entrar no Google Meet →")
        .closest("a")
        ?.getAttribute("href"),
    ).toBe("https://meet.google.com/abc-defg-hij");
  });

  it("failed order: offers to try again", () => {
    render(
      <OrderStatus
        canBuy
        initial={{ ...base, paymentStatus: "failed" }}
        returnHint={null}
      />,
    );
    expect(screen.getByText("O pagamento não foi aprovado.")).toBeTruthy();
    expect(
      screen.getByText("Tentar de novo").closest("a")?.getAttribute("href"),
    ).toBe("/simulacao-de-entrevista/comprar");
  });

  it("failed order with sales closed: no link to buy again", () => {
    render(
      <OrderStatus
        canBuy={false}
        initial={{ ...base, paymentStatus: "failed" }}
        returnHint={null}
      />,
    );
    expect(screen.getByText("O pagamento não foi aprovado.")).toBeTruthy();
    expect(screen.queryByText("Tentar de novo")).toBeNull();
  });
});

describe("resolveCheckoutOrigin", () => {
  it("maps the landing ?origem= to the purchase origin", () => {
    expect(resolveCheckoutOrigin("email", true)).toBe("offer_email");
    expect(resolveCheckoutOrigin("candidatura", true)).toBe(
      "application_offer",
    );
    expect(resolveCheckoutOrigin("vitrine", false)).toBe("showcase");
    expect(resolveCheckoutOrigin(null, true)).toBe("application_offer");
    expect(resolveCheckoutOrigin(undefined, false)).toBe("landing");
  });
});

describe("formatMockInterviewPrice", () => {
  it("formats cents from PRICE_INTERVIEW_SIM as BRL", () => {
    expect(formatMockInterviewPrice(7990)).toBe("R$ 79,90");
    expect(formatMockInterviewPrice(28000)).toBe("R$ 280,00");
    expect(formatMockInterviewPrice(123456)).toBe("R$ 1.234,56");
    expect(formatMockInterviewAmount(7990)).toBe("79,90");
    expect(toSchemaPrice(7990)).toBe("79.90");
  });
});
