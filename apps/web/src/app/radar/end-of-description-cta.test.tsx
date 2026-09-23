import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EndOfDescriptionCta } from "./end-of-description-cta";
import {
  RadarAnalysisPreviewProvider,
  useRadarAnalysisPreview,
} from "./radar-analysis-preview-context";

// Simula o que RadarGuestAnalysisBand faz de verdade (chama
// markPreviewRevealed ao terminar a análise) sem precisar montar o band
// inteiro só pra testar a reação do EndOfDescriptionCta.
function RevealPreviewButton() {
  const { markPreviewRevealed } = useRadarAnalysisPreview();
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
      <RadarAnalysisPreviewProvider>
        <EndOfDescriptionCta
          isAuthenticated={false}
          hasMasterCv={false}
          jobSlug="vaga-exemplo"
        />
      </RadarAnalysisPreviewProvider>,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#radar-guest-analysis");
    expect(screen.getByText(/Veja se seu CV se encaixa/i)).toBeInTheDocument();
  });

  it("anônimo, sem provider (fallback neutro): comporta-se como sem preview", () => {
    render(
      <EndOfDescriptionCta
        isAuthenticated={false}
        hasMasterCv={false}
        jobSlug="vaga-exemplo"
      />,
    );

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "#radar-guest-analysis");
  });

  it("anônimo, depois do preview revelado: troca pra copy/href de cadastro direto", () => {
    render(
      <RadarAnalysisPreviewProvider>
        <RevealPreviewButton />
        <EndOfDescriptionCta
          isAuthenticated={false}
          hasMasterCv={false}
          jobSlug="vaga-exemplo"
        />
      </RadarAnalysisPreviewProvider>,
    );

    fireEvent.click(screen.getByText("revelar preview"));

    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining("/entrar?tab=cadastrar"),
    );
    // O fallback pós-cadastro precisa voltar pra vaga (nunca
    // "/adaptar/resultado" cru, que bounce pra "/adaptar" sem contexto).
    expect(link).toHaveAttribute(
      "href",
      expect.stringContaining(encodeURIComponent("/radar/vaga-exemplo")),
    );
    expect(
      screen.getByText(/Libere sua análise completa/i),
    ).toBeInTheDocument();
  });

  it("logado: sempre aponta pra âncora do CompatCard, independente do preview guest", () => {
    render(
      <RadarAnalysisPreviewProvider>
        <EndOfDescriptionCta
          isAuthenticated
          hasMasterCv
          jobSlug="vaga-exemplo"
        />
      </RadarAnalysisPreviewProvider>,
    );

    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "#radar-compat-card",
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
      <RadarAnalysisPreviewProvider>
        <EndOfDescriptionCta
          isAuthenticated={false}
          hasMasterCv={false}
          jobSlug="vaga-exemplo"
        />
      </RadarAnalysisPreviewProvider>,
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
