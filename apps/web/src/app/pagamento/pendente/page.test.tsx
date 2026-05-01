import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PagamentoPendente from "./page";

const mockUseSearchParams = vi.fn();
const mockGetCheckoutStatusClient = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/payments-browser-api", () => ({
  getCheckoutStatusClient: (...args: unknown[]) =>
    mockGetCheckoutStatusClient(...args),
  resumeCheckoutClient: vi.fn(),
}));

describe("PagamentoPendente", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => (key === "checkoutId" ? "chk-1" : null),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("mostra CTA de download pdf/docx quando pagamento confirma", async () => {
    mockGetCheckoutStatusClient.mockResolvedValue({
      nextAction: "show_success",
      adaptationId: "adapt-1",
    });

    render(<PagamentoPendente />);

    await waitFor(() => {
      expect(
        screen.getByText(
          /seus créditos já estão disponíveis e seu cv já está liberado\./i,
        ),
      ).toBeTruthy();
    });

    expect(
      screen.getByRole("link", { name: "Baixar PDF" }).getAttribute("href"),
    ).toBe("/api/cv-adaptation/adapt-1/download?format=pdf");
    expect(
      screen.getByRole("link", { name: "Baixar DOCX" }).getAttribute("href"),
    ).toBe("/api/cv-adaptation/adapt-1/download?format=docx");
    expect(
      screen
        .getByRole("link", { name: "Voltar para análise e baixar depois" })
        .getAttribute("href"),
    ).toBe("/adaptar/resultado?adaptationId=adapt-1");
  });
});
