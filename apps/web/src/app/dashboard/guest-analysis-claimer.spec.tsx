import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const claimGuestAnalysisJobMock = vi.hoisted(() => vi.fn());
const getPendingGuestAnalysisMock = vi.hoisted(() => vi.fn());
const clearPendingGuestAnalysisMock = vi.hoisted(() => vi.fn());
const clearGuestAnalysisRawMock = vi.hoisted(() => vi.fn());

const routerMock = vi.hoisted(() => ({ push: routerPushMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  claimGuestAnalysisJob: claimGuestAnalysisJobMock,
}));

vi.mock("@/lib/guest-analysis-storage", () => ({
  clearGuestAnalysisRaw: clearGuestAnalysisRawMock,
}));

vi.mock("@/lib/guest-analysis-pending", () => ({
  getPendingGuestAnalysis: getPendingGuestAnalysisMock,
  clearPendingGuestAnalysis: clearPendingGuestAnalysisMock,
}));

import { GuestAnalysisClaimer } from "./guest-analysis-claimer";

describe("GuestAnalysisClaimer", () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    claimGuestAnalysisJobMock.mockReset();
    getPendingGuestAnalysisMock.mockReset();
    clearPendingGuestAnalysisMock.mockReset();
    clearGuestAnalysisRawMock.mockReset();
  });

  afterEach(() => cleanup());

  it("sem claim pendente: não chama o endpoint nem navega", async () => {
    getPendingGuestAnalysisMock.mockReturnValue(null);
    render(<GuestAnalysisClaimer />);
    await act(async () => {});
    expect(claimGuestAnalysisJobMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("claim pendente + succeeded: chama o endpoint canônico só com jobId+token (nunca masterCvText) e navega pro adaptationId", async () => {
    getPendingGuestAnalysisMock.mockReturnValue({
      jobId: "job-1",
      guestPossessionToken: "token-1",
    });
    claimGuestAnalysisJobMock.mockResolvedValue({
      status: "succeeded",
      cvAdaptationId: "adaptation-1",
    });

    render(<GuestAnalysisClaimer />);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/adaptar/resultado?adaptationId=adaptation-1",
      );
    });
    expect(claimGuestAnalysisJobMock).toHaveBeenCalledWith("job-1", "token-1");
    expect(claimGuestAnalysisJobMock).toHaveBeenCalledTimes(1);
    expect(clearPendingGuestAnalysisMock).toHaveBeenCalledTimes(1);
    expect(clearGuestAnalysisRawMock).toHaveBeenCalledTimes(1);
  });

  it("claim pendente ainda processando: navega pro claimJobId pra /adaptar/resultado retomar o polling", async () => {
    getPendingGuestAnalysisMock.mockReturnValue({
      jobId: "job-2",
      guestPossessionToken: "token-2",
    });
    claimGuestAnalysisJobMock.mockResolvedValue({ status: "processing" });

    render(<GuestAnalysisClaimer />);

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/adaptar/resultado?claimJobId=job-2",
      );
    });
  });

  it("token inválido/de outra sessão (backend rejeita): mostra estado de erro recuperável, não navega", async () => {
    getPendingGuestAnalysisMock.mockReturnValue({
      jobId: "job-3",
      guestPossessionToken: "wrong-token",
    });
    claimGuestAnalysisJobMock.mockResolvedValue({ status: "failed" });

    const { findByText } = render(<GuestAnalysisClaimer />);

    await findByText(/Não foi possível salvar a análise anterior/i);
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
