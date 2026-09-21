import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runRadarGuestAnalysisFlowMock = vi.hoisted(() => vi.fn());
const trackEventMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/radar-guest-analysis-flow", () => ({
  runRadarGuestAnalysisFlow: runRadarGuestAnalysisFlowMock,
}));

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));

vi.mock("@/lib/journey-session", () => ({
  getJourneySessionInternalId: () => "sid-1",
  resolveJobProductOrigin: () => "radar",
}));

vi.mock("@/lib/visitor-id", () => ({
  getOrCreateVisitorId: () => "vid-1",
}));

import { RadarGuestAnalysisBand } from "./radar-guest-analysis-band";

function makeFile(name = "cv.pdf") {
  return new File(["conteudo"], name, { type: "application/pdf" });
}

describe("RadarGuestAnalysisBand", () => {
  beforeEach(() => {
    runRadarGuestAnalysisFlowMock.mockReset();
    trackEventMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("estado inicial: mostra o CTA de upload, sem preview nem botão de análise habilitado", () => {
    render(
      <RadarGuestAnalysisBand jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    expect(screen.getByText(/Analisar meu CV para esta vaga/i)).toBeDisabled();
    expect(screen.queryByText(/SEU MATCH COM ESTA VAGA/i)).toBeNull();
  });

  it("upload + clique: chama runRadarGuestAnalysisFlow com radarJobId no FormData e mostra o preview ao suceder", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "preview",
      jobId: "analysis-job-1",
      preview: {
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados",
        companyName: "Stefanini",
        score: { before: 68, after: 82 },
        breakdown: [
          {
            dimension: "skill",
            label: "Skills técnicas",
            coveragePercent: 75,
          },
        ],
        gapsCount: 2,
      },
    });

    render(
      <RadarGuestAnalysisBand jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radar-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    const analyzeButton = screen.getByText(/Analisar meu CV para esta vaga/i);
    expect(analyzeButton).not.toBeDisabled();
    fireEvent.click(analyzeButton);

    await waitFor(() => {
      expect(screen.getByText(/SEU MATCH COM ESTA VAGA/i)).toBeInTheDocument();
    });

    expect(screen.getByText("68%")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(
      screen.getByText(/Criar conta grátis e ver análise completa/i),
    ).toBeInTheDocument();

    const formData = runRadarGuestAnalysisFlowMock.mock.calls[0][0]
      .formData as FormData;
    expect(formData.get("radarJobId")).toBe("job-1");
    expect(formData.get("file")).toBeInstanceOf(File);
    expect(formData.has("jobDescriptionText")).toBe(false);

    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "radar_analysis_cta_clicked" }),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: "radar_analysis_preview_viewed" }),
    );
  });

  it("nunca revela gapExplanation/recommendation/evidence — só o resumo (score, breakdown, contagem de gaps)", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "preview",
      jobId: "analysis-job-2",
      preview: {
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados",
        companyName: "Stefanini",
        score: { before: 60, after: 90 },
        breakdown: [
          { dimension: "skill", label: "Skills técnicas", coveragePercent: 50 },
        ],
        gapsCount: 3,
      },
    });

    render(
      <RadarGuestAnalysisBand jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radar-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByText(/Analisar meu CV para esta vaga/i));

    await waitFor(() => {
      expect(screen.getByText(/Encontramos 3 pontos/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/gapExplanation/i)).toBeNull();
    expect(screen.queryByText(/recommendation/i)).toBeNull();
  });

  it("erro na análise: mostra a mensagem de erro e permanece no estado de upload (nunca mostra preview)", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "error",
      error: "Falha ao analisar CV. Tente novamente.",
    });

    render(
      <RadarGuestAnalysisBand jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radar-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });
    fireEvent.click(screen.getByText(/Analisar meu CV para esta vaga/i));

    await waitFor(() => {
      expect(
        screen.getByText(/Falha ao analisar CV. Tente novamente./i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/SEU MATCH COM ESTA VAGA/i)).toBeNull();
  });

  it("arquivo maior que 5MB: bloqueia antes de sequer chamar o fluxo de análise", () => {
    render(
      <RadarGuestAnalysisBand jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const bigFile = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      "cv-grande.pdf",
      { type: "application/pdf" },
    );
    const fileInput = document.getElementById(
      "radar-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(screen.getByText(/O arquivo é muito grande/i)).toBeInTheDocument();
    expect(runRadarGuestAnalysisFlowMock).not.toHaveBeenCalled();
  });
});
