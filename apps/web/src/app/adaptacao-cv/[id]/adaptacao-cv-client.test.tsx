import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const trackEventMock = vi.hoisted(() => vi.fn());
const getJourneyPreviousRouteMock = vi.hoisted(() => vi.fn());
const downloadFromApiMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics-tracking", () => ({
  trackEvent: trackEventMock,
}));
vi.mock("@/lib/journey-session", () => ({
  getJourneyPreviousRoute: getJourneyPreviousRouteMock,
}));
vi.mock("@/lib/client-download", () => ({
  downloadFromApi: downloadFromApiMock,
}));
vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: vi.fn(),
  getCvAdaptationContent: vi.fn(),
  resetCvAdaptationContent: vi.fn(),
  saveGuestPreview: vi.fn(),
  saveReanalysisResult: vi.fn(),
  updateCvAdaptationContent: vi.fn(),
}));

import type { CvAnalysisData, FinalCvOutput } from "@/lib/cv-adaptation-api";
import { AdaptacaoCvClient } from "./adaptacao-cv-client";

function buildAnalysisData(): CvAnalysisData {
  return {
    vaga: { cargo: "Engenheiro de Dados", empresa: "Acme" },
    fit: {
      score: 78,
      categoria: "alto",
      headline: "Bom encaixe",
      subheadline: "Poucos ajustes necessários",
    },
    ajustes_conteudo: [],
    comparacao: { antes: "", depois: "" },
    pontos_fortes: [],
    lacunas: [],
    melhorias_aplicadas: [],
    ats_keywords: { presentes: [], ausentes: [] },
    preview: { antes: "", depois: "" },
    projecao_melhoria: {
      score_atual: 60,
      score_pos_otimizacao: 78,
      explicacao_curta: "",
    },
    mensagem_venda: { titulo: "", subtexto: "" },
  };
}

function buildFinalCvOutput(): FinalCvOutput {
  return {
    summary: "Resumo profissional",
    sections: [
      {
        sectionType: "header",
        title: "Dados Pessoais",
        items: [{ heading: "Fulano de Tal", bullets: [] }],
      },
    ],
  };
}

describe("AdaptacaoCvClient — optimized_cv_downloaded coverage on /adaptacao-cv/[id]", () => {
  beforeEach(() => {
    trackEventMock.mockReset();
    trackEventMock.mockResolvedValue(undefined);
    getJourneyPreviousRouteMock.mockReset();
    downloadFromApiMock.mockReset();
    downloadFromApiMock.mockResolvedValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function renderClient() {
    return render(
      <AdaptacaoCvClient
        adaptationId="adapt-1"
        analysisData={buildAnalysisData()}
        finalCvOutput={buildFinalCvOutput()}
        editedCvJson={null}
        sectionMapping={{}}
        jobTitle="Engenheiro de Dados"
        companyName="Acme"
        jobDescriptionText="Descrição da vaga"
        adaptationStatus="delivered"
        userName="Fulano"
        userRole={null}
        availableCredits={5}
        jobApplicationId={null}
      />,
    );
  }

  it("emits optimized_cv_downloaded when downloading as PDF from the adaptation detail page", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/adaptar");
    renderClient();

    fireEvent.click(screen.getByText("↓ PDF"));

    expect(trackEventMock).toHaveBeenCalledTimes(1);
    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.eventName).toBe("optimized_cv_downloaded");
    expect(call.properties).toMatchObject({
      format: "pdf",
      adaptation_id: "adapt-1",
    });
  });

  it("emits optimized_cv_downloaded when downloading as DOCX from the adaptation detail page", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/adaptar");
    renderClient();

    fireEvent.click(screen.getByText("↓ DOCX"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ format: "docx" });
  });

  it("resolves product_origin=radar when the previous route came from /radar", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/radar/vaga-1");
    renderClient();

    fireEvent.click(screen.getByText("↓ PDF"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "radar" });
  });

  it("resolves product_origin=candidatura when the previous route came from /candidaturas", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/candidaturas/app-1");
    renderClient();

    fireEvent.click(screen.getByText("↓ PDF"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "candidatura" });
  });

  it("falls back product_origin to analysis for any other previous route", () => {
    getJourneyPreviousRouteMock.mockReturnValue("/dashboard");
    renderClient();

    fireEvent.click(screen.getByText("↓ PDF"));

    const call = trackEventMock.mock.calls[0]?.[0];
    expect(call.properties).toMatchObject({ product_origin: "analysis" });
  });
});
