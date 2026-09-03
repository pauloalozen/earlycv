import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const analyzeMasterCvForJobMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("@/lib/analyze-master-cv-flow", () => ({
  analyzeMasterCvForJob: analyzeMasterCvForJobMock,
}));

import { AnalysisCtaButtons } from "./analysis-cta";

describe("AnalysisCtaButtons", () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    analyzeMasterCvForJobMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("usuário logado com CV master: mostra os dois botões", () => {
    render(
      <AnalysisCtaButtons
        isLoggedIn
        masterResumeId="resume-1"
        radarJobId="job-1"
        jobDescriptionText="descrição da vaga"
        score={72}
        secondaryHref="/adaptar?jobId=job-1"
      />,
    );

    expect(screen.getByTestId("analyze-primary-btn")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Analisar com outro CV/i }),
    ).toBeInTheDocument();
  });

  it("usuário logado sem CV master: só mostra 'Analisar meu CV' (não há 'outro' CV pra contrastar)", () => {
    render(
      <AnalysisCtaButtons
        isLoggedIn
        masterResumeId={null}
        radarJobId="job-1"
        jobDescriptionText="descrição da vaga"
        secondaryHref="/adaptar?jobId=job-1"
      />,
    );

    expect(screen.queryByTestId("analyze-primary-btn")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^Analisar meu CV$/i }),
    ).toBeInTheDocument();
  });

  it("usuário não logado: só mostra 'Analisar meu CV' (não há 'outro' CV pra contrastar)", () => {
    render(
      <AnalysisCtaButtons
        isLoggedIn={false}
        masterResumeId={null}
        radarJobId="job-1"
        jobDescriptionText="descrição da vaga"
        secondaryHref="/entrar?tab=cadastrar&jobId=job-1"
      />,
    );

    expect(screen.queryByTestId("analyze-primary-btn")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: /^Analisar meu CV$/i });
    expect(link).toHaveAttribute("href", "/entrar?tab=cadastrar&jobId=job-1");
  });

  it("botão primário dispara request com radarJobId e masterResumeId, e navega para o resultado", async () => {
    analyzeMasterCvForJobMock.mockResolvedValue({
      ok: true,
      adaptationId: "adapt-1",
    });

    render(
      <AnalysisCtaButtons
        isLoggedIn
        masterResumeId="resume-1"
        radarJobId="job-1"
        jobDescriptionText="descrição da vaga"
        secondaryHref="/adaptar?jobId=job-1"
      />,
    );

    fireEvent.click(screen.getByTestId("analyze-primary-btn"));

    await waitFor(() => {
      expect(analyzeMasterCvForJobMock).toHaveBeenCalledTimes(1);
    });
    expect(analyzeMasterCvForJobMock).toHaveBeenCalledWith(
      expect.objectContaining({
        masterResumeId: "resume-1",
        radarJobId: "job-1",
        jobDescriptionText: "descrição da vaga",
      }),
    );

    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/adaptar/resultado?adaptationId=adapt-1",
      );
    });
  });

  it("em caso de erro: mostra toast e reabilita o botão", async () => {
    analyzeMasterCvForJobMock.mockResolvedValue({
      ok: false,
      error: "Falha ao analisar CV. Tente novamente.",
    });

    render(
      <AnalysisCtaButtons
        isLoggedIn
        masterResumeId="resume-1"
        radarJobId="job-1"
        jobDescriptionText="descrição da vaga"
        secondaryHref="/adaptar?jobId=job-1"
      />,
    );

    const button = screen.getByTestId("analyze-primary-btn");
    fireEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByText("Falha ao analisar CV. Tente novamente."),
      ).toBeInTheDocument();
    });
    expect(button).not.toBeDisabled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });
});
