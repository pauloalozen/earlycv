import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PagamentoPendente from "./page";

const mockUseSearchParams = vi.fn();
const mockGetCheckoutStatusClient = vi.fn();
const mockDownloadFromApi = vi.fn();
const trackEventMock = vi.fn();

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

vi.mock("@/lib/client-download", () => ({
  downloadFromApi: (...args: unknown[]) => mockDownloadFromApi(...args),
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: (...args: unknown[]) => trackEventMock(...args),
}));

describe("PagamentoPendente", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
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

  it("aciona microfeedback ao iniciar download", async () => {
    mockGetCheckoutStatusClient.mockResolvedValue({
      nextAction: "show_success",
      adaptationId: "adapt-1",
    });
    mockDownloadFromApi.mockImplementation(async (options: unknown) => {
      const payload = options as {
        onStageChange?: (stage: "preparing" | "finalizing") => void;
      };
      payload.onStageChange?.("preparing");
    });

    render(<PagamentoPendente />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Baixar PDF" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("link", { name: "Baixar PDF" }));

    await waitFor(() => {
      expect(mockDownloadFromApi).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText(/aguarde, estamos preparando seu download\./i),
      ).toBeTruthy();
    });
  });

  it("emits payment_return_viewed with checkout context", async () => {
    mockUseSearchParams.mockReturnValue({
      get: (key: string) => {
        if (key === "checkoutId") return "chk-1";
        if (key === "payment_id") return "pay-1";
        if (key === "status") return "pending";
        return null;
      },
    });
    mockGetCheckoutStatusClient.mockResolvedValue({
      nextAction: "show_success",
      adaptationId: "adapt-1",
    });

    render(<PagamentoPendente />);

    await waitFor(() => {
      expect(trackEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: "payment_return_viewed",
          properties: expect.objectContaining({
            checkoutId: "chk-1",
            paymentId: "pay-1",
            source_detail: "pagamento_pendente",
            status: "pending",
          }),
        }),
      );
    });
  });
});
