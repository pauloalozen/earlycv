import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EndOfDescriptionCta } from "./end-of-description-cta";
import {
  RadarV2AnalysisPreviewProvider,
  useRadarV2AnalysisPreview,
} from "./radar-analysis-preview-context-v2";

// Simula o que RadarGuestAnalysisBandV2 faz de verdade (chama
// markPreviewRevealed ao terminar a análise) sem precisar montar o band
// inteiro só pra testar a reação do EndOfDescriptionCta.
function RevealPreviewButton() {
  const { markPreviewRevealed } = useRadarV2AnalysisPreview();
  return (
    <button type="button" onClick={markPreviewRevealed}>
      revelar preview
    </button>
  );
}

afterEach(() => {
  cleanup();
});

describe("EndOfDescriptionCta", () => {
  it("anônimo, sem preview ainda: aponta pra âncora do bloco de análise", () => {
    render(
      <RadarV2AnalysisPreviewProvider>
        <EndOfDescriptionCta isAuthenticated={false} hasMasterCv={false} />
      </RadarV2AnalysisPreviewProvider>,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#radar-guest-analysis");
    expect(screen.getByText(/Veja se seu CV se encaixa/i)).toBeInTheDocument();
  });

  it("anônimo, sem provider (fallback neutro): comporta-se como sem preview", () => {
    render(<EndOfDescriptionCta isAuthenticated={false} hasMasterCv={false} />);

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#radar-guest-analysis");
  });

  it("anônimo, depois do preview revelado: troca pra copy/href de cadastro direto", () => {
    render(
      <RadarV2AnalysisPreviewProvider>
        <RevealPreviewButton />
        <EndOfDescriptionCta isAuthenticated={false} hasMasterCv={false} />
      </RadarV2AnalysisPreviewProvider>,
    );

    fireEvent.click(screen.getByText("revelar preview"));

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/entrar?tab=cadastrar"),
    );
    expect(
      screen.getByText(/Libere sua análise completa/i),
    ).toBeInTheDocument();
  });

  it("logado: sempre aponta pra âncora do CompatCard, independente do preview guest", () => {
    render(
      <RadarV2AnalysisPreviewProvider>
        <EndOfDescriptionCta isAuthenticated hasMasterCv />
      </RadarV2AnalysisPreviewProvider>,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "#radarv2-compat-card",
    );
    expect(
      screen.getByText(/Veja seu match real com ela/i),
    ).toBeInTheDocument();
  });

  it("clique (antes do preview): rola descontando a altura da nav fixa, nunca a altura total do viewport", () => {
    const scrollToMock = vi.fn();
    vi.stubGlobal("scrollTo", scrollToMock);

    // <nav aria-label="Breadcrumb"> real da página (não fixo) + o
    // PublicNavBar (fixo) — o handler precisa achar especificamente o
    // fixo, não o primeiro <nav> do documento.
    const breadcrumbNav = document.createElement("nav");
    const fixedNav = document.createElement("nav");
    fixedNav.style.position = "fixed";
    fixedNav.getBoundingClientRect = () => ({ height: 60, top: 0 }) as DOMRect;
    document.body.append(breadcrumbNav, fixedNav);

    const target = document.createElement("div");
    target.id = "radar-guest-analysis";
    target.getBoundingClientRect = () => ({ top: 500, height: 900 }) as DOMRect;
    document.body.append(target);

    render(
      <RadarV2AnalysisPreviewProvider>
        <EndOfDescriptionCta isAuthenticated={false} hasMasterCv={false} />
      </RadarV2AnalysisPreviewProvider>,
    );

    fireEvent.click(screen.getByRole("link"));

    expect(scrollToMock).toHaveBeenCalledTimes(1);
    const call = scrollToMock.mock.calls[0][0] as { top: number };
    // Card (900px) mais alto que o viewport disponível — o topo do card
    // fica logo abaixo da nav fixa (60px), nunca centralizado ignorando
    // a nav (o que cortaria o topo atrás dela).
    expect(call.top).toBe(500 - 60);

    breadcrumbNav.remove();
    fixedNav.remove();
    target.remove();
  });
});
