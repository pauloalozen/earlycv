import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PagamentoFalhou from "./page";

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("PagamentoFalhou", () => {
  afterEach(() => {
    cleanup();
  });

  it("usa o shell visual compartilhado e mantém CTA principal", () => {
    render(<PagamentoFalhou />);

    expect(screen.getByText("v1.2")).toBeTruthy();
    expect(screen.getByText("Pagamento não aprovado")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tentar novamente" })).toBeTruthy();
  });
});
