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

import { RadarGuestAnalysisBandV2 } from "./radar-guest-analysis-band-v2";

function makeFile(name = "cv.pdf") {
  return new File(["conteudo"], name, { type: "application/pdf" });
}

describe("RadarGuestAnalysisBandV2", () => {
  beforeEach(() => {
    runRadarGuestAnalysisFlowMock.mockReset();
    trackEventMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("estado inicial: mostra a área de upload convidando a arrastar o CV, sem preview", () => {
    render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    expect(screen.getByText(/Arraste seu currículo aqui/i)).toBeInTheDocument();
    expect(screen.queryByText(/SEU RESULTADO PARA ESTA VAGA/i)).toBeNull();
  });

  it("upload: dispara a análise automaticamente e mostra o estado de análise (Zeigarnik checklist) antes do preview", async () => {
    let resolveFlow: (value: unknown) => void = () => undefined;
    runRadarGuestAnalysisFlowMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFlow = resolve;
      }),
    );

    render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Comparando seu CV com os requisitos de/i),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Lendo seu currículo/i)).toBeInTheDocument();

    resolveFlow({
      kind: "preview",
      jobId: "analysis-job-1",
      preview: {
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados",
        companyName: "Stefanini",
        score: { before: 50, after: 86 },
        breakdown: [
          { dimension: "skill", label: "Skills técnicas", coveragePercent: 75 },
        ],
        gapsCount: 13,
      },
    });
  });

  it("upload: dispara runRadarGuestAnalysisFlow automaticamente com radarJobId no FormData e mostra gauges + gapsCount real no preview", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "preview",
      jobId: "analysis-job-1",
      preview: {
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados",
        companyName: "Stefanini",
        score: { before: 50, after: 86 },
        breakdown: [
          { dimension: "skill", label: "Skills técnicas", coveragePercent: 75 },
        ],
        gapsCount: 13,
      },
    });

    const { container } = render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(
        screen.getByText(/SEU RESULTADO PARA ESTA VAGA/i),
      ).toBeInTheDocument();
    });

    expect(container.textContent).toContain("50%");
    expect(container.textContent).toContain("86%");
    expect(
      screen.getByText(/Ver os 13 pontos e minha análise completa/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Outros critérios analisados/i),
    ).toBeInTheDocument();

    const formData = runRadarGuestAnalysisFlowMock.mock.calls[0][0]
      .formData as FormData;
    expect(formData.get("radarJobId")).toBe("job-1");
    expect(formData.get("file")).toBeInstanceOf(File);

    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "radar_analysis_cta_clicked",
        properties: expect.objectContaining({ page_variant: "v2" }),
      }),
    );
    expect(trackEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: "radar_analysis_preview_viewed",
        properties: expect.objectContaining({ page_variant: "v2" }),
      }),
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
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText(/Encontramos/i)).toBeInTheDocument();
    });

    expect(screen.queryByText(/gapExplanation/i)).toBeNull();
    expect(screen.queryByText(/recommendation/i)).toBeNull();
  });

  it("breakdown do preview mostra só Skills técnicas + Experiência (nunca outras dimensões), sempre seguido da linha travada", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "preview",
      jobId: "analysis-job-3",
      preview: {
        status: "succeeded",
        lastError: null,
        jobTitle: "Engenheiro de Dados",
        companyName: "Stefanini",
        score: { before: 60, after: 90 },
        breakdown: [
          {
            dimension: "education",
            label: "Formação",
            coveragePercent: 100,
          },
          {
            dimension: "experience",
            label: "Experiência",
            coveragePercent: 40,
          },
          { dimension: "skill", label: "Skills técnicas", coveragePercent: 80 },
          {
            dimension: "language",
            label: "Idiomas",
            coveragePercent: 100,
          },
        ],
        gapsCount: 2,
      },
    });

    render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByText("Skills técnicas")).toBeInTheDocument();
    });

    expect(screen.getByText("Experiência")).toBeInTheDocument();
    expect(
      screen.getByText(/Outros critérios analisados/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Formação")).toBeNull();
    expect(screen.queryByText("Idiomas")).toBeNull();
  });

  it("erro na análise: mostra a mensagem de erro e permanece no estado de upload", async () => {
    runRadarGuestAnalysisFlowMock.mockResolvedValue({
      kind: "error",
      error: "Falha ao analisar CV. Tente novamente.",
    });

    render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(
        screen.getByText(/Falha ao analisar CV. Tente novamente./i),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/SEU RESULTADO PARA ESTA VAGA/i)).toBeNull();
  });

  it("arquivo maior que 5MB: bloqueia antes de sequer chamar o fluxo de análise", () => {
    render(
      <RadarGuestAnalysisBandV2 jobId="job-1" jobTitle="Engenheiro de Dados" />,
    );

    const bigFile = new File(
      [new Uint8Array(6 * 1024 * 1024)],
      "cv-grande.pdf",
      { type: "application/pdf" },
    );
    const fileInput = document.getElementById(
      "radarv2-guest-analysis-file-input",
    ) as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [bigFile] } });

    expect(screen.getByText(/O arquivo é muito grande/i)).toBeInTheDocument();
    expect(runRadarGuestAnalysisFlowMock).not.toHaveBeenCalled();
  });
});
