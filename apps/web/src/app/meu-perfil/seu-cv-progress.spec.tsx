import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerRefreshMock = vi.hoisted(() => vi.fn());
const claimGuestAnalysisJobMock = vi.hoisted(() => vi.fn());
const getPendingGuestAnalysisMock = vi.hoisted(() => vi.fn());

const routerMock = vi.hoisted(() => ({ refresh: routerRefreshMock }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  claimGuestAnalysisJob: claimGuestAnalysisJobMock,
}));

vi.mock("@/lib/guest-analysis-pending", () => ({
  getPendingGuestAnalysis: getPendingGuestAnalysisMock,
}));

import { SeuCvProgress } from "./seu-cv-progress";

describe("SeuCvProgress", () => {
  beforeEach(() => {
    routerRefreshMock.mockReset();
    claimGuestAnalysisJobMock.mockReset();
    getPendingGuestAnalysisMock.mockReset();
  });

  afterEach(() => cleanup());

  it("sem claim pendente: mostra o valor já resolvido pelo servidor, nunca 'Processando'", () => {
    getPendingGuestAnalysisMock.mockReturnValue(null);
    render(<SeuCvProgress profileCompletion={0} masterResumeTitle={null} />);
    expect(screen.queryByText(/Processando seu perfil/i)).toBeNull();
    expect(screen.getByText("Nenhum CV cadastrado ainda")).toBeInTheDocument();
  });

  it("com claim pendente: mostra 'Processando seu perfil' em vez de 0%, e chama router.refresh() ao concluir", async () => {
    getPendingGuestAnalysisMock.mockReturnValue({
      jobId: "job-1",
      guestPossessionToken: "token-1",
    });
    claimGuestAnalysisJobMock.mockResolvedValue({
      status: "succeeded",
      cvAdaptationId: "adaptation-1",
    });

    render(<SeuCvProgress profileCompletion={0} masterResumeTitle={null} />);

    expect(screen.getByText(/Processando seu perfil/i)).toBeInTheDocument();
    expect(screen.queryByText("Nenhum CV cadastrado ainda")).toBeNull();

    await waitFor(() => {
      expect(routerRefreshMock).toHaveBeenCalledTimes(1);
    });
    expect(claimGuestAnalysisJobMock).toHaveBeenCalledWith("job-1", "token-1");
  });
});
