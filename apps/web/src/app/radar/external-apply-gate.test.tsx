import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExternalApplyGate } from "./external-apply-gate";

afterEach(() => {
  cleanup();
});

describe("ExternalApplyGate", () => {
  beforeEach(() => {
    vi.stubGlobal("open", vi.fn());
  });

  it("abre o popup ao clicar em Candidatar-se externamente, com o CTA 'Fazer minha análise' (sem prefixo de cadastro)", () => {
    render(
      <ExternalApplyGate
        href="https://example.com/vaga"
        company="Acme"
        jobId="job-1"
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByText(/Candidatar-se externamente/i));

    expect(
      screen.getByRole("link", { name: /Fazer minha análise/i }),
    ).toBeInTheDocument();
  });

  it("anônimo: clique no CTA fecha o popup e rola até o bloco de análise, sem navegar pra /entrar", () => {
    const scrollToMock = vi.fn();
    vi.stubGlobal("scrollTo", scrollToMock);

    const target = document.createElement("div");
    target.id = "radar-guest-analysis";
    target.getBoundingClientRect = () => ({ top: 400, height: 300 }) as DOMRect;
    document.body.append(target);

    render(
      <ExternalApplyGate
        href="https://example.com/vaga"
        company="Acme"
        jobId="job-1"
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByText(/Candidatar-se externamente/i));
    const cta = screen.getByRole("link", { name: /Fazer minha análise/i });
    expect(cta).toHaveAttribute("href", "#radar-guest-analysis");

    fireEvent.click(cta);

    expect(scrollToMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();

    target.remove();
  });

  it("logado: CTA aponta pro /adaptar com o jobId, sem interceptar o clique (navegação normal)", () => {
    render(
      <ExternalApplyGate
        href="https://example.com/vaga"
        company="Acme"
        jobId="job-42"
        isAuthenticated
      />,
    );

    fireEvent.click(screen.getByText(/Candidatar-se externamente/i));

    expect(
      screen.getByRole("link", { name: /Fazer minha análise/i }),
    ).toHaveAttribute("href", "/adaptar?jobId=job-42");
  });

  it("'não, prefiro me candidatar sem analisar' abre a vaga externa numa nova aba e fecha o popup", () => {
    const openMock = vi.fn();
    vi.stubGlobal("open", openMock);

    render(
      <ExternalApplyGate
        href="https://example.com/vaga"
        company="Acme"
        jobId="job-1"
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByText(/Candidatar-se externamente/i));
    fireEvent.click(screen.getByText(/prefiro me candidatar sem analisar/i));

    expect(openMock).toHaveBeenCalledWith(
      "https://example.com/vaga",
      "_blank",
      "noopener,noreferrer",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
