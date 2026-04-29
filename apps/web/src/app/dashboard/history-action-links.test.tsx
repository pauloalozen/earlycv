import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HistoryActionLinks } from "./history-action-links";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const baseProps = {
  actions: {
    resultHref: "/adaptar/resultado?adaptationId=abc",
    redeemHref: "/api/cv-adaptation/abc/redeem-credit",
    plansHref: "/planos",
    pdfHref: "/api/cv-adaptation/abc/download?format=pdf",
    docxHref: "/api/cv-adaptation/abc/download?format=docx",
    canDownload: false,
    canRedeem: true,
    isProcessing: false,
  },
  adjustments: {
    notes: "ajustes",
    scoreBefore: 40,
    scoreFinal: 70,
  },
  analysisContext: {
    jobTitle: "Dev",
    masterResumeTitle: "Meu CV",
  },
  hasCredits: true,
} as const;

describe("HistoryActionLinks redeem persistence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );
  });

  it("switches card actions right after successful redeem", async () => {
    render(<HistoryActionLinks {...baseProps} />);

    fireEvent.click(screen.getByText("Liberar CV · 1 Crédito"));
    await vi.advanceTimersByTimeAsync(3100);

    expect(screen.getAllByText("Baixar PDF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Baixar DOCX").length).toBeGreaterThan(0);
  });

  it("restores redeemed state from sessionStorage on mount", () => {
    sessionStorage.setItem(
      "dashboard-cv-redeemed:/api/cv-adaptation/abc/redeem-credit",
      "1",
    );

    render(<HistoryActionLinks {...baseProps} />);

    expect(screen.getAllByText("Baixar PDF").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Baixar DOCX").length).toBeGreaterThan(0);
  });
});
