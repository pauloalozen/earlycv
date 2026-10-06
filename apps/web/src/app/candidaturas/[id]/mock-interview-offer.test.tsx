import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MockInterviewOfferCard,
  MockInterviewOfferModal,
  shouldShowMockInterviewOfferModal,
} from "./mock-interview-offer";

describe("MockInterviewOfferCard", () => {
  afterEach(cleanup);

  it("offers the mock interview with checkout carrying the application as origin", () => {
    render(
      <MockInterviewOfferCard
        active={null}
        applicationId="app-1"
        priceLabel="R$ 79,90"
      />,
    );
    expect(
      screen.getByText("Quero treinar →").closest("a")?.getAttribute("href"),
    ).toBe(
      "/simulacao-de-entrevista/comprar?origem=candidatura&candidatura=app-1",
    );
    expect(screen.getByText("R$ 79,90")).toBeTruthy();
  });

  it("with an active purchase, points to the order instead of selling again", () => {
    render(
      <MockInterviewOfferCard
        active={{ id: "p1", code: "ABC123" }}
        applicationId="app-1"
      />,
    );
    expect(screen.queryByText("Quero treinar →")).toBeNull();
    expect(
      screen.getByText("Ver pedido").closest("a")?.getAttribute("href"),
    ).toBe("/simulacao-de-entrevista/pedido/p1");
  });
});

describe("MockInterviewOfferModal", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
  });
  afterEach(cleanup);

  it("shows once per application and closes on 'Agora não'", () => {
    vi.useFakeTimers();
    expect(shouldShowMockInterviewOfferModal("app-1")).toBe(true);
    const onClose = vi.fn();
    render(<MockInterviewOfferModal applicationId="app-1" onClose={onClose} />);
    expect(shouldShowMockInterviewOfferModal("app-1")).toBe(false);
    expect(shouldShowMockInterviewOfferModal("app-2")).toBe(true);

    fireEvent.click(screen.getByText("Agora não"));
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalled();
    vi.useRealTimers();
  });
});

describe("MockInterviewOfferCard without a configured price", () => {
  afterEach(cleanup);

  it("still offers the session but shows no price", () => {
    render(<MockInterviewOfferCard active={null} applicationId="app-1" />);
    expect(screen.getByText("Quero treinar →")).toBeTruthy();
    expect(screen.queryByText(/R\$/)).toBeNull();
  });
});
