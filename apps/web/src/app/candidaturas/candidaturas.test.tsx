import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ refresh: vi.fn() })),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    style,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    className?: string;
  }) => (
    <a href={href} style={style} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/job-applications-api", () => ({
  createJobApplication: vi.fn(),
  restoreJobApplication: vi.fn(),
  deleteJobApplication: vi.fn(),
  updateJobApplicationStatus: vi.fn(),
  addJobApplicationNote: vi.fn(),
  generateOrGetInterviewPrep: vi.fn(),
  splitJobApplicationAnalysis: vi.fn(),
}));

import type {
  InterviewPrepDto,
  JobApplicationDetailDto,
  JobApplicationDto,
} from "@/lib/job-applications-api";
import {
  addJobApplicationNote,
  createJobApplication,
  deleteJobApplication,
  generateOrGetInterviewPrep,
  updateJobApplicationStatus,
} from "@/lib/job-applications-api";
import { DetailClient } from "./[id]/detail-client";
import { CandidaturasClient } from "./candidaturas-client";

function makeApp(
  overrides: Partial<JobApplicationDto> = {},
): JobApplicationDto {
  return {
    id: "app-1",
    userId: "user-1",
    jobTitle: "Engenheiro de Software",
    companyName: "Acme Corp",
    location: "São Paulo, SP",
    jobUrl: null,
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
    archivedAt: null,
    deletedAt: null,
    createdAt: "2026-05-01T10:00:00Z",
    updatedAt: "2026-05-10T10:00:00Z",
    events: [],
    interviewPrep: null,
    ...overrides,
  };
}

function makeDetail(
  overrides: Partial<JobApplicationDetailDto> = {},
): JobApplicationDetailDto {
  return {
    ...makeApp(),
    cvAdaptations: [],
    ...overrides,
  };
}

function makePrep(overrides: Partial<InterviewPrepDto> = {}): InterviewPrepDto {
  return {
    id: "prep-1",
    jobApplicationId: "app-1",
    generatedAt: "2026-05-10T10:00:00Z",
    generatedContentJson: {
      strategySummary: "Prepare-se bem para esta entrevista.",
      strengthsToHighlight: ["Ponto A", "Ponto B"],
      likelyRisksOrGaps: ["Gap X"],
      questionsTheyMayAsk: [
        {
          question: "Por que quer trabalhar aqui?",
          whyItMatters: "Avalia motivação.",
          answerDirection: "Seja específico e genuíno.",
        },
      ],
      questionsCandidateShouldAsk: ["Como é o dia a dia?"],
      recommendedPosture: ["Seja direto"],
      finalChecklist: ["Pesquise a empresa"],
    },
    ...overrides,
  };
}

function getPrepTriggerButton() {
  return screen.getAllByRole("button", { name: /Preparar entrevista/ })[0];
}

describe("CandidaturasClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("1. empty state when no applications exist", () => {
    render(<CandidaturasClient initialApplications={[]} header={null} />);

    expect(screen.getByText(/NADA POR AQUI AINDA/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Analisar uma vaga/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Adicionar manualmente/i }),
    ).toBeInTheDocument();
  });

  it("2. renders application cards with title and company", () => {
    const apps = [
      makeApp({
        id: "a1",
        jobTitle: "Dev Frontend",
        companyName: "Beta Inc",
        status: "SAVED",
      }),
      makeApp({
        id: "a2",
        jobTitle: "Dev Backend",
        companyName: "Gamma Ltd",
        status: "INTERVIEW",
      }),
    ];
    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getByText("Dev Frontend")).toBeInTheDocument();
    expect(screen.getByText("Dev Backend")).toBeInTheDocument();
    expect(screen.getByText("Beta Inc")).toBeInTheDocument();
    expect(screen.getByText("Gamma Ltd")).toBeInTheDocument();
  });

  it("3. filters cards by status group when tab is clicked", () => {
    const apps = [
      makeApp({ id: "a1", jobTitle: "Open Job", status: "SAVED" }),
      makeApp({ id: "a2", jobTitle: "Process Job", status: "INTERVIEW" }),
      makeApp({ id: "a3", jobTitle: "Closed Job", status: "REJECTED" }),
    ];
    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getByText("Open Job")).toBeInTheDocument();
    expect(screen.getByText("Process Job")).toBeInTheDocument();
    expect(screen.getByText("Closed Job")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Em processo/ }));

    expect(screen.queryByText("Open Job")).not.toBeInTheDocument();
    expect(screen.getByText("Process Job")).toBeInTheDocument();
    expect(screen.queryByText("Closed Job")).not.toBeInTheDocument();
  });

  it("4. clicking 'Adicionar candidatura' opens create modal", async () => {
    render(<CandidaturasClient initialApplications={[]} header={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );

    await waitFor(() => {
      expect(screen.getByText("Adicionar manualmente")).toBeInTheDocument();
    });
  });

  it("5. create form submits with only required fields", async () => {
    vi.mocked(createJobApplication).mockResolvedValue(makeApp());

    render(<CandidaturasClient initialApplications={[]} header={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );
    await waitFor(() => screen.getByText("Adicionar manualmente"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Dev Sênior" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Minha Empresa" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar candidatura" }));

    await waitFor(() => {
      expect(createJobApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          jobTitle: "Dev Sênior",
          companyName: "Minha Empresa",
        }),
      );
    });
  });

  it("6. create form submits without optional URL field", async () => {
    vi.mocked(createJobApplication).mockResolvedValue(makeApp());

    render(<CandidaturasClient initialApplications={[]} header={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );
    await waitFor(() => screen.getByText("Adicionar manualmente"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Analista" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    // URL field intentionally left empty

    fireEvent.click(screen.getByRole("button", { name: "Salvar candidatura" }));

    await waitFor(() => {
      expect(createJobApplication).toHaveBeenCalled();
      const call = vi.mocked(createJobApplication).mock.calls[0][0];
      expect(call).not.toHaveProperty("jobUrl");
    });
  });

  it("6b. create form sends jobDescriptionText when filled", async () => {
    vi.mocked(createJobApplication).mockResolvedValue(makeApp());

    render(<CandidaturasClient initialApplications={[]} header={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );
    await waitFor(() => screen.getByText("Adicionar manualmente"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "PM" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Cole a descrição/), {
      target: { value: "Responsável por roadmap e entregas da squad." },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar candidatura" }));

    await waitFor(() => {
      expect(createJobApplication).toHaveBeenCalledWith(
        expect.objectContaining({
          jobDescriptionText: "Responsável por roadmap e entregas da squad.",
        }),
      );
    });
  });

  it("6c. create form omits jobDescriptionText when field is empty", async () => {
    vi.mocked(createJobApplication).mockResolvedValue(makeApp());

    render(<CandidaturasClient initialApplications={[]} header={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );
    await waitFor(() => screen.getByText("Adicionar manualmente"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Analista" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    // description field intentionally left empty

    fireEvent.click(screen.getByRole("button", { name: "Salvar candidatura" }));

    await waitFor(() => {
      const call = vi.mocked(createJobApplication).mock.calls[0][0];
      expect(call).not.toHaveProperty("jobDescriptionText");
    });
  });

  it("9. status badges show correct labels per status", () => {
    const apps = [
      makeApp({ id: "s1", jobTitle: "Job Salva", status: "SAVED" }),
      makeApp({ id: "s2", jobTitle: "Job Proposta", status: "OFFER" }),
      makeApp({ id: "s3", jobTitle: "Job Contratado", status: "HIRED" }),
    ];
    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getByText("SALVA")).toBeInTheDocument();
    expect(screen.getByText("OFERTA")).toBeInTheDocument();
    expect(screen.getByText("CONTRATADO")).toBeInTheDocument();
  });

  it("10. shows derived scores when application scores are null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        adaptedContentJson: {
          projecao_melhoria: {
            score_atual: 55,
            score_pos_otimizacao: 75,
          },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const apps = [
      makeApp({
        id: "a1",
        jobTitle: "Dev Fullstack",
        companyName: "Delta",
        status: "INTERVIEW",
        currentCvAdaptationId: "adapt-1",
        scoreBefore: null,
        scoreAfter: null,
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cv-adaptation/adapt-1/content",
        { cache: "no-store" },
      );
    });
  });

  it("11. shows 'Ainda não analisada' for scorePresentation=not_analyzed and never falls back to 0%", () => {
    const apps = [
      makeApp({
        id: "not-analyzed-1",
        status: "SAVED",
        scoreBefore: null,
        scoreAfter: null,
        bestScore: null,
        bestCvAdaptationId: null,
        bestCvState: "missing",
        scorePresentation: "not_analyzed",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getByText("Ainda não analisada")).toBeInTheDocument();
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("12. scorePresentation=scored shows compact highlight score layout", () => {
    const apps = [
      makeApp({
        id: "scored-1",
        status: "CV_READY",
        scorePresentation: "scored",
        bestScore: 87,
        bestCvState: "ready",
        bestCvAdaptationId: "adapt-best-1",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getAllByText("SCORE")).toHaveLength(1);
    expect(screen.getByTestId("score-highlight-value")).toHaveTextContent(
      "87%",
    );
    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("12b. score value takes precedence over not_analyzed fallback", () => {
    const apps = [
      makeApp({
        id: "scored-from-value-1",
        status: "CV_READY",
        scorePresentation: "not_analyzed",
        bestScore: 82,
        bestCvState: "ready",
        bestCvAdaptationId: "adapt-best-82",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getAllByText("SCORE")).toHaveLength(1);
    expect(screen.getByTestId("score-highlight-value")).toHaveTextContent(
      "82%",
    );
    expect(screen.queryByText("Ainda não analisada")).not.toBeInTheDocument();
  });

  it("12c. score block shows delta against original when both values exist", () => {
    const apps = [
      makeApp({
        id: "delta-1",
        status: "CV_READY",
        scorePresentation: "scored",
        scoreBefore: 67,
        scoreAfter: 83,
        bestScore: 83,
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.getByTestId("score-highlight-value")).toHaveTextContent(
      "83%",
    );
    expect(screen.getByTestId("score-highlight-delta")).toHaveTextContent(
      "+16 vs original",
    );
  });

  it("13. locked bestCvState asks confirmation before redeeming", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    const apps = [
      makeApp({
        id: "locked-1",
        status: "CV_READY",
        scorePresentation: "scored",
        bestScore: 80,
        bestCvState: "locked",
        bestCvAdaptationId: "adapt-locked-1",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    fireEvent.click(
      screen.getByRole("button", { name: /Liberar CV · 1 crédito/i }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Confirmar liberação/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /Confirmar liberação/i }),
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cv-adaptation/adapt-locked-1/redeem-credit",
        expect.objectContaining({ method: "POST", cache: "no-store" }),
      );
    });
  });

  it("14. ready bestCvState renders quick download action", () => {
    const apps = [
      makeApp({
        id: "ready-1",
        status: "CV_READY",
        scorePresentation: "scored",
        bestScore: 91,
        bestCvState: "ready",
        bestCvAdaptationId: "adapt-ready-1",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    const downloadLink = screen.getByRole("link", {
      name: /Baixar melhor CV/i,
    });
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/cv-adaptation/adapt-ready-1/download?format=pdf",
    );
  });

  it("15. archived card shows Excluir only when archived and bestCvState is not unlocked", () => {
    const archivedLocked = makeApp({
      id: "arch-locked",
      archivedAt: "2026-05-10T10:00:00Z",
      bestCvState: "locked",
    });
    const archivedUnlocked = makeApp({
      id: "arch-unlocked",
      archivedAt: "2026-05-10T10:00:00Z",
      bestCvState: "unlocked",
    });

    render(
      <CandidaturasClient
        initialApplications={[]}
        initialArchivedApplications={[archivedLocked, archivedUnlocked]}
        initialView="arquivadas"
        header={null}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Excluir" })).toHaveLength(1);
  });

  it("16. archived card delete removes item from list on success", async () => {
    vi.mocked(deleteJobApplication).mockResolvedValue(
      makeApp({
        id: "arch-delete",
        archivedAt: "2026-05-10T10:00:00Z",
      }),
    );

    render(
      <CandidaturasClient
        initialApplications={[]}
        initialArchivedApplications={[
          makeApp({
            id: "arch-delete",
            jobTitle: "Arquivada removivel",
            archivedAt: "2026-05-10T10:00:00Z",
            bestCvState: "locked",
          }),
        ]}
        initialView="arquivadas"
        header={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));

    await waitFor(() => {
      expect(deleteJobApplication).toHaveBeenCalledWith("arch-delete");
      expect(screen.queryByText("Arquivada removivel")).not.toBeInTheDocument();
    });
  });

  it("14b. hides details link on cards", () => {
    const apps = [makeApp({ id: "no-details-1", status: "APPLIED" })];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    expect(screen.queryByText(/Detalhes/)).not.toBeInTheDocument();
  });

  it("14c. renders download action when current adaptation exists and cv is unlocked", () => {
    const apps = [
      makeApp({
        id: "download-any-unlocked-1",
        status: "CV_READY",
        scorePresentation: "scored",
        bestScore: 89,
        bestCvState: "missing",
        bestCvAdaptationId: null,
        currentCvAdaptationId: "adapt-available-1",
      }),
    ];

    render(<CandidaturasClient initialApplications={apps} header={null} />);

    const downloadLink = screen.getByRole("link", {
      name: /Baixar melhor CV/i,
    });
    expect(downloadLink).toHaveAttribute(
      "href",
      "/api/cv-adaptation/adapt-available-1/download?format=pdf",
    );
  });
});

describe.skip("DetailClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("7. update status panel calls updateJobApplicationStatus with correct args", async () => {
    vi.mocked(updateJobApplicationStatus).mockResolvedValue(
      makeApp({ status: "IN_PROCESS" }),
    );

    const app = makeDetail({ id: "app-99", status: "APPLIED" });
    render(<DetailClient application={app} header={null} />);

    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "IN_PROCESS" } });

    fireEvent.click(screen.getByRole("button", { name: "Salvar status" }));

    await waitFor(() => {
      expect(updateJobApplicationStatus).toHaveBeenCalledWith(
        "app-99",
        "IN_PROCESS",
      );
    });
  });

  it("8a. 'Abrir vaga' link is visible when jobUrl is set", () => {
    const app = makeDetail({ jobUrl: "https://example.com/job/123" });
    render(<DetailClient application={app} header={null} />);

    const link = screen.getByRole("link", { name: /Abrir vaga/ });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "https://example.com/job/123");
  });

  it("8b. 'Abrir vaga' link is absent when jobUrl is null", () => {
    const app = makeDetail({ jobUrl: null });
    render(<DetailClient application={app} header={null} />);

    expect(
      screen.queryByRole("link", { name: /Abrir vaga/ }),
    ).not.toBeInTheDocument();
  });

  it("10. notes panel calls addJobApplicationNote with the typed note", async () => {
    vi.mocked(addJobApplicationNote).mockResolvedValue(makeApp());

    const app = makeDetail({ id: "app-42", notes: null });
    render(<DetailClient application={app} header={null} />);

    const textarea = screen.getByPlaceholderText(/Anotações sobre a vaga/);
    fireEvent.change(textarea, {
      target: { value: "Entrevista agendada para quinta" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Salvar nota" }));

    await waitFor(() => {
      expect(addJobApplicationNote).toHaveBeenCalledWith(
        "app-42",
        "Entrevista agendada para quinta",
      );
    });
  });

  it("11. shows job description section when jobDescriptionText exists", () => {
    const app = makeDetail({
      jobDescriptionText:
        "Você será responsável pelo desenvolvimento de APIs REST.",
    });
    render(<DetailClient application={app} header={null} />);

    expect(screen.getByText("Descrição da vaga")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Você será responsável pelo desenvolvimento de APIs REST/,
      ),
    ).toBeInTheDocument();
  });

  it("12. hides job description section when jobDescriptionText is null", () => {
    const app = makeDetail({ jobDescriptionText: null });
    render(<DetailClient application={app} header={null} />);

    expect(screen.queryByText("Descrição da vaga")).not.toBeInTheDocument();
  });

  it("13. 'Preparar entrevista' button visible for eligible status (INTERVIEW)", () => {
    const app = makeDetail({ status: "INTERVIEW" });
    render(<DetailClient application={app} header={null} />);

    expect(
      screen.getAllByRole("button", { name: /Preparar entrevista/ }).length,
    ).toBeGreaterThan(0);
  });

  it("14. 'Preparar entrevista' button NOT shown for closed status (REJECTED)", () => {
    const app = makeDetail({ status: "REJECTED" });
    render(<DetailClient application={app} header={null} />);

    expect(
      screen.queryByRole("button", { name: /Preparar entrevista/ }),
    ).not.toBeInTheDocument();
  });

  it("15. clicking 'Preparar entrevista' opens the drawer with generate button", async () => {
    const app = makeDetail({ status: "INTERVIEW", interviewPrep: null });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(getPrepTriggerButton());

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Gerar preparação/ }),
      ).toBeInTheDocument();
    });
  });

  it("16. calls generateOrGetInterviewPrep when 'Gerar preparação' is clicked", async () => {
    vi.mocked(generateOrGetInterviewPrep).mockResolvedValue(makePrep());

    const app = makeDetail({ status: "APPLIED", interviewPrep: null });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(getPrepTriggerButton());
    await waitFor(() =>
      screen.getByRole("button", { name: /Gerar preparação/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Gerar preparação/ }));
    await waitFor(() => {
      expect(generateOrGetInterviewPrep).toHaveBeenCalledWith("app-1");
    });
  });

  it("17. renders prep briefing sections when interviewPrep exists", () => {
    const app = makeDetail({
      status: "INTERVIEW",
      interviewPrep: makePrep(),
    });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver preparação/ }));

    expect(
      screen.getByText("Prepare-se bem para esta entrevista."),
    ).toBeInTheDocument();
    expect(screen.getByText("Ponto A")).toBeInTheDocument();
    expect(screen.getByText("Gap X")).toBeInTheDocument();
    expect(
      screen.getByText("Por que quer trabalhar aqui?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Pesquise a empresa")).toBeInTheDocument();
  });

  it("18. shows error message when generation fails", async () => {
    vi.mocked(generateOrGetInterviewPrep).mockRejectedValue(
      new Error("Falha ao gerar preparação"),
    );

    const app = makeDetail({ status: "OFFER", interviewPrep: null });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(getPrepTriggerButton());
    await waitFor(() =>
      screen.getByRole("button", { name: /Gerar preparação/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Gerar preparação/ }));

    await waitFor(() => {
      expect(screen.getByText("Falha ao gerar preparação")).toBeInTheDocument();
    });
  });

  it("19. hides strategySummary section when it is an empty string", () => {
    const prep = makePrep({
      generatedContentJson: {
        ...makePrep().generatedContentJson,
        strategySummary: "",
      },
    });
    const app = makeDetail({ status: "INTERVIEW", interviewPrep: prep });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver preparação/ }));

    expect(screen.queryByText("Estratégia geral")).not.toBeInTheDocument();
  });

  it("20. hides optional array sections when they are empty", () => {
    const prep = makePrep({
      generatedContentJson: {
        strategySummary: "Resumo presente.",
        strengthsToHighlight: [],
        likelyRisksOrGaps: [],
        questionsTheyMayAsk: [],
        questionsCandidateShouldAsk: [],
        recommendedPosture: [],
        finalChecklist: [],
      },
    });
    const app = makeDetail({ status: "INTERVIEW", interviewPrep: prep });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Ver preparação/ }));

    expect(
      screen.queryByText("Pontos fortes para destacar"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Riscos ou gaps prováveis"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Perguntas que podem fazer"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Perguntas para fazer à empresa"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Postura recomendada")).not.toBeInTheDocument();
    expect(screen.queryByText("Checklist final")).not.toBeInTheDocument();

    expect(screen.getByText("Resumo presente.")).toBeInTheDocument();
  });

  it("21. retry after error — second click calls generateOrGetInterviewPrep again", async () => {
    vi.mocked(generateOrGetInterviewPrep)
      .mockRejectedValueOnce(new Error("Timeout"))
      .mockResolvedValueOnce(makePrep());

    const app = makeDetail({ status: "ASSESSMENT", interviewPrep: null });
    render(<DetailClient application={app} header={null} />);

    fireEvent.click(getPrepTriggerButton());
    await waitFor(() =>
      screen.getByRole("button", { name: /Gerar preparação/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Gerar preparação/ }));
    await waitFor(() =>
      expect(screen.getByText("Timeout")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Gerar preparação/ }));
    await waitFor(() =>
      expect(
        screen.getByText("Prepare-se bem para esta entrevista."),
      ).toBeInTheDocument(),
    );

    expect(generateOrGetInterviewPrep).toHaveBeenCalledTimes(2);
  });

  it("22. locked action does not auto-redeem credit", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const app = makeDetail({
      cvAdaptations: [
        {
          id: "adapt-locked-1",
          status: "awaiting_payment",
          jobTitle: "Engenheiro de Software",
          companyName: "Acme",
          isUnlocked: false,
          adaptedResumeId: null,
          createdAt: "2026-05-10T10:00:00Z",
        },
      ],
    });

    render(<DetailClient application={app} header={null} />);

    fireEvent.click(screen.getByRole("button", { name: /Liberar CV/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/plans/me", {
        cache: "no-store",
      });
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cv-adaptation/adapt-locked-1/redeem-credit",
      {
        method: "POST",
        cache: "no-store",
      },
    );
  });
});
