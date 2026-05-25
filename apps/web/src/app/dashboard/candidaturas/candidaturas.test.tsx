import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  PageShell: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@/lib/job-applications-api", () => ({
  createJobApplication: vi.fn(),
  updateJobApplicationStatus: vi.fn(),
  addJobApplicationNote: vi.fn(),
}));

import { CandidaturasClient } from "./candidaturas-client";
import { DetailClient } from "./[id]/detail-client";
import {
  createJobApplication,
  updateJobApplicationStatus,
  addJobApplicationNote,
} from "@/lib/job-applications-api";
import type {
  JobApplicationDetailDto,
  JobApplicationDto,
} from "@/lib/job-applications-api";

function makeApp(overrides: Partial<JobApplicationDto> = {}): JobApplicationDto {
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
    notes: null,
    appliedAt: null,
    nextActionAt: null,
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

describe("CandidaturasClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("1. empty state when no applications exist", () => {
    render(<CandidaturasClient initialApplications={[]} header={null} />);

    expect(
      screen.getByText("Ainda não há candidaturas"),
    ).toBeInTheDocument();
    expect(screen.getByText("Analisar uma vaga")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar manualmente" }),
    ).toBeInTheDocument();
  });

  it("2. renders application cards with title and company", () => {
    const apps = [
      makeApp({ id: "a1", jobTitle: "Dev Frontend", companyName: "Beta Inc", status: "SAVED" }),
      makeApp({ id: "a2", jobTitle: "Dev Backend", companyName: "Gamma Ltd", status: "INTERVIEW" }),
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
      expect(screen.getByText("Nova candidatura")).toBeInTheDocument();
    });
  });

  it("5. create form submits with only required fields", async () => {
    vi.mocked(createJobApplication).mockResolvedValue(makeApp());

    render(<CandidaturasClient initialApplications={[]} header={null} />);
    fireEvent.click(
      screen.getByRole("button", { name: /Adicionar candidatura/ }),
    );
    await waitFor(() => screen.getByText("Nova candidatura"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Dev Sênior" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Minha Empresa" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

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
    await waitFor(() => screen.getByText("Nova candidatura"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Analista" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    // URL field intentionally left empty

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

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
    await waitFor(() => screen.getByText("Nova candidatura"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "PM" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(/Cole a descrição/),
      { target: { value: "Responsável por roadmap e entregas da squad." } },
    );

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

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
    await waitFor(() => screen.getByText("Nova candidatura"));

    fireEvent.change(
      screen.getByPlaceholderText(/Engenheiro de Software Sênior/),
      { target: { value: "Analista" } },
    );
    fireEvent.change(screen.getByPlaceholderText(/Acme Corp/), {
      target: { value: "Corp" },
    });
    // description field intentionally left empty

    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

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

    expect(screen.getByText("Salva")).toBeInTheDocument();
    expect(screen.getByText("Proposta")).toBeInTheDocument();
    expect(screen.getByText("Contratado")).toBeInTheDocument();
  });
});

describe("DetailClient", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
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

    const textarea = screen.getByPlaceholderText(
      /Anotações sobre a vaga/,
    );
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
      jobDescriptionText: "Você será responsável pelo desenvolvimento de APIs REST.",
    });
    render(<DetailClient application={app} header={null} />);

    expect(screen.getByText("Descrição da vaga")).toBeInTheDocument();
    expect(
      screen.getByText(/Você será responsável pelo desenvolvimento de APIs REST/),
    ).toBeInTheDocument();
  });

  it("12. hides job description section when jobDescriptionText is null", () => {
    const app = makeDetail({ jobDescriptionText: null });
    render(<DetailClient application={app} header={null} />);

    expect(screen.queryByText("Descrição da vaga")).not.toBeInTheDocument();
  });
});
