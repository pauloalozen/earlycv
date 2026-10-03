import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { JobApplicationDto } from "@/lib/job-applications-api";

const api = vi.hoisted(() => ({
  archiveJobApplication: vi.fn(),
  deleteJobApplication: vi.fn(),
  reorderJobApplicationsBoard: vi.fn(),
  restoreJobApplication: vi.fn(),
  updateJobApplicationStatus: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/job-applications-api", () => api);
vi.mock("@/lib/journey-session", () => ({
  getJourneySessionInternalId: () => "journey-1",
}));

import { KanbanBoard } from "./kanban-board";

function application(
  overrides: Partial<JobApplicationDto> & { id: string },
): JobApplicationDto {
  return {
    userId: "user-1",
    jobTitle: `Vaga ${overrides.id}`,
    companyName: "Acme",
    companyLogoUrl: null,
    companyWebsiteUrl: null,
    location: "São Paulo, SP",
    jobUrl: null,
    jobId: null,
    jobSlug: null,
    jobClosed: false,
    jobDescriptionText: null,
    status: "APPLIED",
    origin: "manual",
    currentCvAdaptationId: null,
    scoreBefore: null,
    scoreAfter: null,
    bestScore: null,
    bestCvAdaptationId: null,
    bestCvState: "missing",
    scorePresentation: "not_analyzed",
    notes: null,
    appliedAt: null,
    nextActionAt: null,
    interviewTitle: null,
    interviewerName: null,
    interviewMeetingUrl: null,
    interviewLocation: null,
    rejectionStrengths: null,
    rejectionImprovements: null,
    archivedAt: null,
    deletedAt: null,
    boardPosition: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    events: [],
    interviewPrep: null,
    ...overrides,
  } as JobApplicationDto;
}

function columnOf(label: string) {
  return screen.getByRole("region", { name: label });
}

function titlesIn(label: string) {
  return within(columnOf(label))
    .queryAllByRole("link")
    .map((link) => link.textContent)
    .filter((text) => text?.startsWith("Vaga"));
}

function renderBoard(
  applications: JobApplicationDto[],
  props: Partial<Parameters<typeof KanbanBoard>[0]> = {},
) {
  const onArchived = vi.fn();
  const onUnarchived = vi.fn();
  render(
    <KanbanBoard
      initialApplications={applications}
      matchesFilter={() => true}
      derivedScores={{}}
      hasCredits
      onArchived={onArchived}
      onUnarchived={onUnarchived}
      {...props}
    />,
  );
  return { onArchived, onUnarchived };
}

function openMoveMenu(title: string) {
  const card = screen.getByRole("link", { name: title }).closest("article");
  if (!card) throw new Error("card not found");
  fireEvent.click(
    within(card as HTMLElement).getByRole("button", {
      name: "Mover para outra etapa",
    }),
  );
  return card as HTMLElement;
}

beforeEach(() => {
  api.archiveJobApplication.mockResolvedValue({
    archivedAt: "2026-10-03T00:00:00.000Z",
  });
  api.reorderJobApplicationsBoard.mockResolvedValue(undefined);
  api.restoreJobApplication.mockResolvedValue({});
  api.updateJobApplicationStatus.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("KanbanBoard", () => {
  it("distribui as candidaturas nas etapas, com a ordem manual primeiro", () => {
    renderBoard([
      application({ id: "a", status: "SAVED" }),
      application({
        id: "b",
        status: "APPLIED",
        updatedAt: "2026-09-30T00:00:00.000Z",
      }),
      application({ id: "c", status: "APPLIED", boardPosition: 0 }),
      application({ id: "d", status: "ASSESSMENT" }),
      application({ id: "e", status: "HIRED" }),
    ]);

    expect(titlesIn("Salva")).toEqual(["Vaga a"]);
    expect(titlesIn("Candidatado")).toEqual(["Vaga c", "Vaga b"]);
    expect(titlesIn("Em entrevista")).toEqual(["Vaga d"]);
    // Só Finalizada mostra o desfecho no card.
    expect(
      within(columnOf("Finalizado")).getByText("CONTRATADO"),
    ).toBeInTheDocument();
  });

  it("mostra o badge de vaga encerrada no card", () => {
    renderBoard([application({ id: "a", jobClosed: true })]);
    expect(
      within(columnOf("Candidatado")).getByText("VAGA ENCERRADA"),
    ).toBeInTheDocument();
  });

  it("filtra por empresa sem perder as outras do estado", () => {
    renderBoard(
      [
        application({ id: "a", companyName: "Acme" }),
        application({ id: "b", companyName: "Globex" }),
      ],
      { matchesFilter: (item) => item.companyName === "Globex" },
    );
    expect(titlesIn("Candidatado")).toEqual(["Vaga b"]);
  });

  it("move de etapa pelo menu: grava o status e a ordem da etapa de destino", async () => {
    renderBoard([
      application({ id: "a", status: "CV_READY" }),
      application({ id: "b", status: "APPLIED", boardPosition: 0 }),
    ]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(
      within(card).getByRole("menuitem", { name: "Candidatado" }),
    );

    await waitFor(() =>
      expect(api.updateJobApplicationStatus).toHaveBeenCalledWith(
        "a",
        "APPLIED",
        undefined,
        "journey-1",
      ),
    );
    await waitFor(() =>
      expect(api.reorderJobApplicationsBoard).toHaveBeenCalledWith(["b", "a"]),
    );
    expect(titlesIn("Candidatado")).toEqual(["Vaga b", "Vaga a"]);
    expect(
      await screen.findByText("Movida para Candidatado"),
    ).toBeInTheDocument();
  });

  it("ao entrar em Em entrevista oferece agendar a entrevista no detalhe", async () => {
    renderBoard([application({ id: "a", status: "APPLIED" })]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(
      within(card).getByRole("menuitem", { name: "Em entrevista" }),
    );

    const link = await screen.findByRole("link", {
      name: "Agendar entrevista",
    });
    expect(link).toHaveAttribute("href", "/candidaturas/a?acao=entrevista");
    expect(api.updateJobApplicationStatus).toHaveBeenCalledWith(
      "a",
      "INTERVIEW",
      undefined,
      "journey-1",
    );
  });

  it("Finalizado pergunta o desfecho; Recusado fica no quadro (sem arquivar) e oferece o feedback", async () => {
    const { onArchived } = renderBoard([application({ id: "a" })]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(within(card).getByRole("menuitem", { name: "Finalizado" }));

    const dialog = screen.getByRole("dialog", { name: "Como terminou?" });
    expect(api.updateJobApplicationStatus).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Recusado" }));

    await waitFor(() =>
      expect(api.updateJobApplicationStatus).toHaveBeenCalledWith(
        "a",
        "REJECTED",
        undefined,
        "journey-1",
      ),
    );
    await waitFor(() =>
      expect(api.reorderJobApplicationsBoard).toHaveBeenCalledWith(["a"]),
    );
    // Arquivar é só manual: a candidatura finalizada fica em Finalizado.
    expect(onArchived).not.toHaveBeenCalled();
    expect(titlesIn("Finalizado")).toEqual(["Vaga a"]);
    expect(
      within(columnOf("Finalizado")).getByText("RECUSADO"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Registrar feedback" }),
    ).toHaveAttribute("href", "/candidaturas/a?acao=feedback");
    expect(screen.queryByTestId("hired-confetti")).toBeNull();
  });

  it("Contratado comemora com confete na tela toda e o popup de parabéns", async () => {
    renderBoard([application({ id: "a" })]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(within(card).getByRole("menuitem", { name: "Finalizado" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "Como terminou?" })).getByRole(
        "button",
        { name: "Contratado" },
      ),
    );

    expect(await screen.findByTestId("hired-confetti")).toBeInTheDocument();
    expect(titlesIn("Finalizado")).toEqual(["Vaga a"]);

    // Mesmo popup de parabéns do detalhe da candidatura.
    const popup = await screen.findByRole("dialog", { name: "Parabéns!" });
    expect(within(popup).getByText("Você foi contratado.")).toBeInTheDocument();
    expect(
      within(popup).getByRole("link", { name: "Ver candidatura" }),
    ).toHaveAttribute("href", "/candidaturas/a");
    fireEvent.click(within(popup).getByRole("button", { name: "Fechar" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Parabéns!" })).toBeNull(),
    );
  });

  it("cancelar o desfecho devolve o card pra onde estava sem gravar nada", async () => {
    renderBoard([application({ id: "a" })]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(within(card).getByRole("menuitem", { name: "Finalizado" }));
    fireEvent.click(screen.getByRole("button", { name: /Cancelar/ }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Como terminou?" }),
      ).toBeNull(),
    );
    expect(titlesIn("Candidatado")).toEqual(["Vaga a"]);
    expect(titlesIn("Finalizado")).toEqual([]);
    expect(api.updateJobApplicationStatus).not.toHaveBeenCalled();
  });

  it("arquivar tira o card do quadro e Desfazer restaura", async () => {
    const { onArchived, onUnarchived } = renderBoard([
      application({ id: "a" }),
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "Arquivar candidatura" }),
    );

    await waitFor(() =>
      expect(api.archiveJobApplication).toHaveBeenCalledWith("a", "journey-1"),
    );
    expect(titlesIn("Candidatado")).toEqual([]);
    expect(onArchived).toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    });

    await waitFor(() =>
      expect(api.restoreJobApplication).toHaveBeenCalledWith("a"),
    );
    expect(onUnarchived).toHaveBeenCalledWith("a");
    expect(titlesIn("Candidatado")).toEqual(["Vaga a"]);
  });

  it("se o servidor recusar a mudança, o card volta e aparece o erro", async () => {
    api.updateJobApplicationStatus.mockRejectedValueOnce(new Error("boom"));
    renderBoard([application({ id: "a", status: "CV_READY" })]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(
      within(card).getByRole("menuitem", { name: "Candidatado" }),
    );

    expect(
      await screen.findByText(
        "Não foi possível salvar a mudança. Tente de novo.",
      ),
    ).toBeInTheDocument();
    expect(titlesIn("Salva")).toEqual(["Vaga a"]);
    expect(titlesIn("Candidatado")).toEqual([]);
  });

  it("oculta e expande uma etapa, lembrando a escolha neste navegador", () => {
    const store = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
    });
    renderBoard([application({ id: "a" })]);

    fireEvent.click(
      screen.getByRole("button", { name: "Ocultar Candidatado" }),
    );
    expect(screen.queryByRole("link", { name: "Vaga a" })).toBeNull();
    expect(within(columnOf("Candidatado")).getByText("1")).toBeInTheDocument();
    expect(
      JSON.parse(
        window.localStorage.getItem("earlycv:candidaturas:colunas-ocultas") ??
          "[]",
      ),
    ).toEqual(["applied"]);

    cleanup();
    renderBoard([application({ id: "a" })]);
    expect(screen.queryByRole("link", { name: "Vaga a" })).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: "Expandir Candidatado" }),
    );
    expect(screen.getByRole("link", { name: "Vaga a" })).toBeInTheDocument();
  });

  it("sem colunas fora da tela, não mostra as setas nem libera arrastar pra rolar", () => {
    renderBoard([application({ id: "a" })]);
    const board = columnOf("Salva").closest(".kb-board");
    expect(board).toHaveAttribute("data-scrollable", "false");
    expect(
      screen.queryByRole("button", { name: "Rolar etapas para a esquerda" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Rolar etapas para a direita" }),
    ).toBeNull();
  });

  it("Salva agrupa as ações de antes da candidatura e mostra o andamento em badge", () => {
    renderBoard([
      application({ id: "a", status: "SAVED" }),
      application({ id: "b", status: "ANALYZED" }),
      application({ id: "c", status: "CV_READY", bestCvState: "ready" }),
    ]);

    const salva = columnOf("Salva");
    expect(titlesIn("Salva")).toHaveLength(3);
    expect(within(salva).getByText("CV ANALISADO")).toBeInTheDocument();
    expect(within(salva).getByText("CV LIBERADO")).toBeInTheDocument();
    // CV liberado já diz que o CV está pronto: sem badge duplicado.
    expect(within(salva).queryByText("CV ADAPTADO")).toBeNull();
  });

  it("voltar de Candidatado pra Salva preserva o progresso (CV liberado)", async () => {
    renderBoard([
      application({ id: "a", status: "APPLIED", bestCvState: "ready" }),
    ]);

    const card = openMoveMenu("Vaga a");
    fireEvent.click(within(card).getByRole("menuitem", { name: "Salva" }));

    await waitFor(() =>
      expect(api.updateJobApplicationStatus).toHaveBeenCalledWith(
        "a",
        "CV_READY",
        undefined,
        "journey-1",
      ),
    );
  });

  it("arquivadas: mesmo quadro só pra consulta — sem mover, sem arrastar, sem arquivar", () => {
    renderBoard(
      [application({ id: "a", archivedAt: "2026-10-01T00:00:00.000Z" })],
      { mode: "archived" },
    );

    const card = screen
      .getByRole("link", { name: "Vaga a" })
      .closest("article") as HTMLElement;
    expect(card).not.toHaveAttribute("aria-roledescription");
    expect(
      within(card).queryByRole("button", { name: "Mover para outra etapa" }),
    ).toBeNull();
    expect(
      within(card).queryByRole("button", { name: "Arquivar candidatura" }),
    ).toBeNull();
    expect(
      within(card).getByRole("button", { name: "Restaurar" }),
    ).toBeInTheDocument();
    expect(
      within(columnOf("Salva")).getByText(
        "Nenhuma candidatura arquivada nesta etapa",
      ),
    ).toBeInTheDocument();
  });

  it("arquivadas: Restaurar devolve pras ativas", async () => {
    const onRestored = vi.fn();
    renderBoard(
      [application({ id: "a", archivedAt: "2026-10-01T00:00:00.000Z" })],
      { mode: "archived", onRestored },
    );

    fireEvent.click(screen.getByRole("button", { name: "Restaurar" }));

    await waitFor(() =>
      expect(api.restoreJobApplication).toHaveBeenCalledWith("a"),
    );
    expect(onRestored).toHaveBeenCalledWith("a");
    expect(titlesIn("Candidatado")).toEqual([]);
    expect(
      await screen.findByText("Candidatura restaurada para Ativas"),
    ).toBeInTheDocument();
  });

  it("arquivadas: Excluir só sem CV liberado, e pede confirmação", async () => {
    api.deleteJobApplication.mockResolvedValue({});
    const onDeleted = vi.fn();
    renderBoard(
      [
        application({ id: "a", archivedAt: "2026-10-01T00:00:00.000Z" }),
        application({
          id: "b",
          archivedAt: "2026-10-01T00:00:00.000Z",
          bestCvState: "unlocked",
        }),
      ],
      { mode: "archived", onDeleted },
    );

    const buttons = screen.getAllByRole("button", {
      name: "Excluir candidatura",
    });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0] as HTMLElement);
    expect(api.deleteJobApplication).not.toHaveBeenCalled();
    fireEvent.click(
      within(
        screen.getByRole("dialog", { name: "Excluir candidatura?" }),
      ).getByRole("button", { name: "Excluir" }),
    );

    await waitFor(() =>
      expect(api.deleteJobApplication).toHaveBeenCalledWith("a", "journey-1"),
    );
    expect(onDeleted).toHaveBeenCalledWith("a");
    expect(titlesIn("Candidatado")).toEqual(["Vaga b"]);
  });
});
