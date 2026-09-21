import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
});
