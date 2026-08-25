import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routerPushMock = vi.hoisted(() => vi.fn());
const runGuestAnalysisFlowMock = vi.hoisted(() => vi.fn());
const runAuthenticatedAnalysisFlowMock = vi.hoisted(() => vi.fn());
const requestTokenMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPushMock }),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));

vi.mock("@/lib/guest-analysis-flow", () => ({
  runGuestAnalysisFlow: runGuestAnalysisFlowMock,
}));

vi.mock("@/lib/authenticated-analysis-flow", () => ({
  runAuthenticatedAnalysisFlow: runAuthenticatedAnalysisFlowMock,
}));

vi.mock("@/lib/use-turnstile-token", () => ({
  useTurnstileToken: () => ({
    turnstileSiteKey: null,
    containerRef: { current: null },
    requestToken: requestTokenMock,
    onScriptReady: vi.fn(),
  }),
}));

vi.mock("@/lib/journey-session", () => ({
  getJourneySessionInternalId: () => "sid-1",
}));

vi.mock("@/lib/visitor-id", () => ({
  getOrCreateVisitorId: () => "vid-1",
}));

import { GuestAnalysisWidget } from "./guest-analysis-widget";

function fillCvTextAndAdvance() {
  fireEvent.click(screen.getByText("Ou cole o texto do currículo"));
  fireEvent.change(screen.getByPlaceholderText(/Cole seu currículo/), {
    target: {
      value:
        "Experiência profissional:\nDesenvolvedor de software há 5 anos, atuando com produtos web.\nFormação: Ciência da Computação.\nCompetências: TypeScript, React, Node.js.",
    },
  });
  fireEvent.click(screen.getByText("Continuar →"));
}

describe("GuestAnalysisWidget", () => {
  beforeEach(() => {
    routerPushMock.mockReset();
    runGuestAnalysisFlowMock.mockReset();
    runAuthenticatedAnalysisFlowMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("passo 1 → passo 2: exige CV válido antes de revelar a vaga", () => {
    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={false}
        isAuthenticated={false}
      />,
    );

    expect(
      screen.queryByPlaceholderText("Cole a vaga completa"),
    ).not.toBeInTheDocument();

    fillCvTextAndAdvance();

    expect(
      screen.getByPlaceholderText("Cole a vaga completa"),
    ).toBeInTheDocument();
  });

  it("upload de arquivo mostra progresso fake de 2s e depois avança para o passo 2, sem precisar de Continuar", () => {
    vi.useFakeTimers();
    try {
      render(
        <GuestAnalysisWidget
          guestAnalysisAuthGateEnabled={false}
          isAuthenticated={false}
        />,
      );

      const file = new File(["conteúdo"], "curriculo.pdf", {
        type: "application/pdf",
      });
      const input = document.getElementById(
        "lp-f-file-input",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      expect(screen.getByText(/Lendo curriculo\.pdf/)).toBeInTheDocument();
      expect(
        screen.queryByPlaceholderText("Cole a vaga completa"),
      ).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });

      expect(
        screen.getByPlaceholderText("Cole a vaga completa"),
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejeita arquivo maior que 5 MB, sem avançar de passo (mesma proteção de /adaptar)", () => {
    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={false}
        isAuthenticated={false}
      />,
    );

    const oversizedFile = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "curriculo-grande.pdf",
      { type: "application/pdf" },
    );
    const input = document.getElementById(
      "lp-f-file-input",
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [oversizedFile] } });

    expect(
      screen.getByText(/arquivo é muito grande.*5 MB/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Lendo curriculo/)).not.toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Cole a vaga completa"),
    ).not.toBeInTheDocument();
  });

  it("passo 2: clicar num exemplo de vaga preenche a textarea", () => {
    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={false}
        isAuthenticated={false}
      />,
    );
    fillCvTextAndAdvance();

    fireEvent.click(screen.getByText("Product Manager"));

    expect(
      (
        screen.getByPlaceholderText(
          "Cole a vaga completa",
        ) as HTMLTextAreaElement
      ).value,
    ).toContain("Product Manager Pleno — Braze");
  });

  it("texto de CV muito curto mantém o botão Continuar desabilitado", () => {
    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={false}
        isAuthenticated={false}
      />,
    );

    fireEvent.click(screen.getByText("Ou cole o texto do currículo"));
    fireEvent.change(screen.getByPlaceholderText(/Cole seu currículo/), {
      target: { value: "muito curto" },
    });

    expect(screen.getByText("Continuar →")).toBeDisabled();
    expect(
      screen.queryByPlaceholderText("Cole a vaga completa"),
    ).not.toBeInTheDocument();
  });

  it("guest + gate ON: chama runGuestAnalysisFlow com a flag e navega para o destino retornado, mostrando a microcopy", async () => {
    runGuestAnalysisFlowMock.mockResolvedValue({
      kind: "gated",
      destination: "/entrar?ctx=analysis_guest",
    });

    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={true}
        isAuthenticated={false}
      />,
    );
    fillCvTextAndAdvance();

    expect(
      screen.getByText(/crie sua conta pra ver o resultado completo/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cole a vaga completa"), {
      target: { value: "Vaga de exemplo com descrição completa." },
    });
    fireEvent.click(screen.getByText("Analisar meu CV"));

    await vi.waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/entrar?ctx=analysis_guest");
    });

    expect(runAuthenticatedAnalysisFlowMock).not.toHaveBeenCalled();
    const callArgs = runGuestAnalysisFlowMock.mock.calls[0][0];
    expect(callArgs.guestAnalysisAuthGateEnabled).toBe(true);
    expect(callArgs.journeyContext).toEqual({
      sessionInternalId: "sid-1",
      visitorId: "vid-1",
    });
  });

  it("guest + gate OFF: navega para /adaptar/resultado e não mostra a microcopy", async () => {
    runGuestAnalysisFlowMock.mockResolvedValue({
      kind: "revealed",
      destination: "/adaptar/resultado",
    });

    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={false}
        isAuthenticated={false}
      />,
    );
    fillCvTextAndAdvance();

    expect(
      screen.queryByText(/crie sua conta pra ver o resultado completo/i),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cole a vaga completa"), {
      target: { value: "Vaga de exemplo com descrição completa." },
    });
    fireEvent.click(screen.getByText("Analisar meu CV"));

    await vi.waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith("/adaptar/resultado");
    });
  });

  it("usuário já logado: usa runAuthenticatedAnalysisFlow (nunca o guest), sem microcopy mesmo com o gate ON, e navega direto pro resultado", async () => {
    runAuthenticatedAnalysisFlowMock.mockResolvedValue({
      kind: "revealed",
      destination: "/adaptar/resultado?adaptationId=abc-123",
    });

    render(
      <GuestAnalysisWidget
        guestAnalysisAuthGateEnabled={true}
        isAuthenticated={true}
      />,
    );
    fillCvTextAndAdvance();

    expect(
      screen.queryByText(/crie sua conta pra ver o resultado completo/i),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cole a vaga completa"), {
      target: { value: "Vaga de exemplo com descrição completa." },
    });
    fireEvent.click(screen.getByText("Analisar meu CV"));

    await vi.waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith(
        "/adaptar/resultado?adaptationId=abc-123",
      );
    });

    expect(runGuestAnalysisFlowMock).not.toHaveBeenCalled();
    const callArgs = runAuthenticatedAnalysisFlowMock.mock.calls[0][0];
    expect(callArgs.inputMode).toBe("text_paste");
    expect(callArgs.journeyContext).toEqual({
      sessionInternalId: "sid-1",
      visitorId: "vid-1",
    });
  });

  it("durante a espera, troca a mensagem do botão em vez de ficar parado em 'Analisando...'", async () => {
    vi.useFakeTimers();
    try {
      let resolveFlow: (value: {
        kind: "revealed";
        destination: string;
      }) => void = () => {};
      runAuthenticatedAnalysisFlowMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFlow = resolve;
        }),
      );

      render(
        <GuestAnalysisWidget
          guestAnalysisAuthGateEnabled={false}
          isAuthenticated={true}
        />,
      );
      fillCvTextAndAdvance();
      fireEvent.change(screen.getByPlaceholderText("Cole a vaga completa"), {
        target: { value: "Vaga de exemplo com descrição completa." },
      });
      fireEvent.click(screen.getByText("Analisar meu CV"));

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByText("Lendo seu CV...")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(3500);
      });
      expect(screen.getByText("Comparando com a vaga...")).toBeInTheDocument();

      resolveFlow({ kind: "revealed", destination: "/adaptar/resultado" });
      await act(async () => {
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("mostra o overlay que bloqueia clique na página inteira durante o upload (progresso fake) e durante a análise real", async () => {
    vi.useFakeTimers();
    try {
      let resolveFlow: (value: {
        kind: "revealed";
        destination: string;
      }) => void = () => {};
      runGuestAnalysisFlowMock.mockReturnValue(
        new Promise((resolve) => {
          resolveFlow = resolve;
        }),
      );

      render(
        <GuestAnalysisWidget
          guestAnalysisAuthGateEnabled={false}
          isAuthenticated={false}
        />,
      );

      expect(
        screen.queryByTestId("lp-f-processing-overlay"),
      ).not.toBeInTheDocument();

      const file = new File(["conteúdo"], "curriculo.pdf", {
        type: "application/pdf",
      });
      const input = document.getElementById(
        "lp-f-file-input",
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [file] } });

      // Durante o progresso fake de upload (scanningFile) o overlay já
      // bloqueia a página, não só durante a análise real.
      expect(screen.getByTestId("lp-f-processing-overlay")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(
        screen.queryByTestId("lp-f-processing-overlay"),
      ).not.toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText("Cole a vaga completa"), {
        target: { value: "Vaga de exemplo com descrição completa." },
      });
      fireEvent.click(screen.getByText("Analisar meu CV"));

      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("lp-f-processing-overlay")).toBeInTheDocument();

      resolveFlow({ kind: "revealed", destination: "/adaptar/resultado" });
      await act(async () => {
        await Promise.resolve();
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
