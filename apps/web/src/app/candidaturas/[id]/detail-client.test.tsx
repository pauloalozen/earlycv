import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getDashboardScoreColor } from "@/lib/dashboard-test-metrics";
import type { JobApplicationDetailDto } from "@/lib/job-applications-api";
import {
  deleteJobApplication,
  splitJobApplicationAnalysis,
} from "@/lib/job-applications-api";
import { DetailClient } from "./detail-client";

const routerRefreshMock = vi.fn();
const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: routerRefreshMock,
    push: routerPushMock,
  }),
}));

vi.mock("@/lib/job-applications-api", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/job-applications-api")
  >("@/lib/job-applications-api");

  return {
    ...actual,
    deleteJobApplication: vi.fn(),
    splitJobApplicationAnalysis: vi.fn(),
  };
});

function buildApplication(
  overrides?: Partial<JobApplicationDetailDto>,
): JobApplicationDetailDto {
  return {
    id: "app_123",
    userId: "user_1",
    jobTitle: "Software Engineer",
    companyName: "Acme",
    location: null,
    jobUrl: null,
    jobDescriptionText: null,
    status: "CV_READY",
    origin: "manual",
    currentCvAdaptationId: "adp_123",
    scoreBefore: 55,
    scoreAfter: 78,
    bestCvAdaptationId: "adp_123",
    bestScore: 78,
    bestCvState: "ready",
    scorePresentation: "scored",
    interviewPrepLocked: false,
    interviewPrepLockReason: null,
    selectedCvAdaptationId: "adp_123",
    selectedCvUnlocked: true,
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
    createdAt: "2026-05-01T00:00:00.000Z",
    updatedAt: "2026-05-01T00:00:00.000Z",
    events: [],
    interviewPrep: null,
    cvAdaptations: [
      {
        id: "adp_123",
        status: "completed",
        jobTitle: "Software Engineer",
        companyName: "Acme",
        isUnlocked: false,
        adaptedResumeId: "res_123",
        createdAt: "2026-05-01T00:00:00.000Z",
        scoreBefore: 50,
        scoreAfter: 73,
        canDownloadBaseCv: false,
        resumeUsedTitle: "CV Master",
      },
    ],
    ...overrides,
  };
}

function makeEvent(index: number): JobApplicationDetailDto["events"][number] {
  return {
    id: `event_${index}`,
    jobApplicationId: "app_123",
    eventType: index % 2 === 0 ? "STATUS_CHANGED" : "NOTE_ADDED",
    previousStatus: null,
    newStatus: index % 2 === 0 ? "APPLIED" : null,
    metadata: null,
    createdAt: `2026-05-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
  };
}

describe("DetailClient - CV ADAPTADO card", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows version badges for best and current adaptations", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          currentCvAdaptationId: "adp_current",
          bestCvAdaptationId: "adp_best",
          cvAdaptations: [
            {
              id: "adp_current",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-02T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
            {
              id: "adp_best",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_124",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(screen.getByText("Versão atual")).toBeTruthy();
    expect(screen.getByText("Melhor versão")).toBeTruthy();
  });

  it("shows best score from the best analyzed adaptation", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          scoreBefore: 55,
          scoreAfter: 68,
          bestScore: 68,
          bestCvAdaptationId: "adp_best",
          cvAdaptations: [
            {
              id: "adp_current",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-02T00:00:00.000Z",
              scoreBefore: 55,
              scoreAfter: 68,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
            {
              id: "adp_best",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_124",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 67,
              scoreAfter: 83,
              canDownloadBaseCv: false,
              resumeUsedTitle: "Meu CV Dados",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(screen.getByText("83%")).toBeTruthy();
  });

  it("applies score color variation to the best score badge", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          scoreBefore: 55,
          scoreAfter: 68,
          bestScore: 68,
          bestCvAdaptationId: "adp_best",
          cvAdaptations: [
            {
              id: "adp_best",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_124",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 67,
              scoreAfter: 83,
              canDownloadBaseCv: false,
              resumeUsedTitle: "Meu CV Dados",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(screen.getByText("83%")).toHaveStyle({
      color: getDashboardScoreColor(83),
    });
  });

  it("shows the resume used for the selected analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          cvAdaptations: [
            {
              id: "adp_123",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
          ],
        })}
        header={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

    expect(await screen.findByText(/CV usado na análise:/i)).toBeTruthy();
    expect(screen.getByText("CV Master")).toBeTruthy();
  });

  it("shows a non-master resume title in the adjustments popup", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          cvAdaptations: [
            {
              id: "adp_123",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "Meu CV Dados",
            },
          ],
        })}
        header={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

    expect(await screen.findByText("Meu CV Dados")).toBeTruthy();
  });

  it("shows fallback text when resume used cannot be identified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          cvAdaptations: [
            {
              id: "adp_123",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: null,
            },
          ],
        })}
        header={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ajustes feitos/i }));

    expect(await screen.findByText("Não identificado")).toBeTruthy();
  });

  it("shows the correct resume title for each analysis in the same application", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          currentCvAdaptationId: "adp_master",
          cvAdaptations: [
            {
              id: "adp_master",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_master",
              createdAt: "2026-05-02T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
            {
              id: "adp_data",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_data",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 48,
              scoreAfter: 76,
              canDownloadBaseCv: false,
              resumeUsedTitle: "Meu CV Dados",
            },
          ],
        })}
        header={<div />}
      />,
    );

    fireEvent.click(screen.getByTestId("analysis-adjustments-adp_data"));
    expect(await screen.findByText("Meu CV Dados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /fechar/i }));

    fireEvent.click(screen.getByTestId("analysis-adjustments-adp_master"));
    expect(await screen.findByText("CV Master")).toBeTruthy();
  });

  it("does not show timeline scroll controls when there are up to five events", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          events: Array.from({ length: 5 }, (_, index) => makeEvent(index)),
        })}
        header={<div />}
      />,
    );

    expect(screen.queryByRole("button", { name: /subir eventos/i })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /descer eventos/i }),
    ).toBeNull();
  });

  it("shows timeline scroll controls when there are more than five events", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          events: Array.from({ length: 6 }, (_, index) => makeEvent(index)),
        })}
        header={<div />}
      />,
    );

    expect(screen.getByRole("button", { name: /subir eventos/i })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /descer eventos/i }),
    ).toBeTruthy();
  });

  it("shows newest timeline events first", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          events: [makeEvent(0), makeEvent(1), makeEvent(2)],
        })}
        header={<div />}
      />,
    );

    const timelineTexts = screen.getAllByText(
      /Nota adicionada\.|Status atualizado para/i,
    );

    expect(timelineTexts[0]).toHaveTextContent(
      "Status atualizado para Enviada",
    );
    expect(timelineTexts[1]).toHaveTextContent("Nota adicionada.");
    expect(timelineTexts[2]).toHaveTextContent(
      "Status atualizado para Enviada",
    );
  });

  it("shows unlock path for interview prep when selected CV is locked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 0 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          status: "APPLIED",
          interviewPrepLocked: true,
          interviewPrepLockReason: "selected_cv_locked",
          selectedCvAdaptationId: "adp_123",
          selectedCvUnlocked: false,
          cvAdaptations: [
            {
              id: "adp_123",
              status: "awaiting_payment",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: false,
              adaptedResumeId: null,
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(
      screen.getByRole("link", { name: /liberar cv para entrevista/i }),
    ).toBeTruthy();
    expect(
      screen.getByText(/libere o cv desta vaga para preparar sua entrevista/i),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /preparar entrevista/i }),
    ).toBeNull();
  });

  it("keeps interview prep available when the selected CV is unlocked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          status: "APPLIED",
          interviewPrepLocked: false,
          interviewPrepLockReason: null,
          selectedCvAdaptationId: "adp_current",
          selectedCvUnlocked: true,
          currentCvAdaptationId: "adp_current",
          cvAdaptations: [
            {
              id: "adp_current",
              status: "delivered",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-02T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
            {
              id: "adp_latest",
              status: "delivered",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_124",
              createdAt: "2026-05-03T00:00:00.000Z",
              scoreBefore: 52,
              scoreAfter: 79,
              canDownloadBaseCv: false,
              resumeUsedTitle: "Meu CV Dados",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(
      screen.getByRole("button", { name: /preparar entrevista/i }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("link", { name: /liberar cv para entrevista/i }),
    ).toBeNull();
  });

  it("splits an analysis into a new application and navigates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );
    vi.mocked(splitJobApplicationAnalysis).mockResolvedValue({
      newApplicationId: "app_new_123",
    });
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );

    render(<DetailClient application={buildApplication()} header={<div />} />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /separar em nova candidatura/i,
      })[0],
    );

    await waitFor(() => {
      expect(splitJobApplicationAnalysis).toHaveBeenCalledWith(
        "app_123",
        "adp_123",
      );
      expect(routerPushMock).toHaveBeenCalledWith("/candidaturas/app_new_123");
    });
  });

  it("does not split when user cancels confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => false),
    );

    render(<DetailClient application={buildApplication()} header={<div />} />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /separar em nova candidatura/i,
      })[0],
    );

    await waitFor(() => {
      expect(globalThis.confirm).toHaveBeenCalledTimes(1);
    });
    expect(splitJobApplicationAnalysis).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalled();
  });

  it("shows split inline error feedback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );
    vi.mocked(splitJobApplicationAnalysis).mockRejectedValue(
      new Error("Falha ao separar análise"),
    );
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );

    render(<DetailClient application={buildApplication()} header={<div />} />);

    fireEvent.click(
      screen.getAllByRole("button", {
        name: /separar em nova candidatura/i,
      })[0],
    );

    await waitFor(() => {
      expect(screen.getByText("Falha ao separar análise")).toBeTruthy();
    });
  });

  it("shows unlock button when adaptation is locked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(<DetailClient application={buildApplication()} header={<div />} />);

    expect(screen.getByRole("button", { name: /liberar cv/i })).toBeTruthy();
  });

  it("shows plans link with aid/source/next when no credits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 0 }),
      })) as unknown as typeof fetch,
    );

    render(<DetailClient application={buildApplication()} header={<div />} />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /liberar cv/i })).toBeTruthy();
    });

    const link = screen.getByRole("link", { name: /liberar cv/i });
    const href = link.getAttribute("href") ?? "";
    expect(href).toContain("/planos?");
    expect(href).toContain("aid=adp_123");
    expect(href).toContain("source=dashboard-candidatura-unlock");
    expect(href).toContain("next=%2Fcandidaturas%2Fapp_123");
  });

  it("shows download actions when unlocked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    render(
      <DetailClient
        application={buildApplication({
          cvAdaptations: [
            {
              id: "adp_123",
              status: "completed",
              jobTitle: "Software Engineer",
              companyName: "Acme",
              isUnlocked: true,
              adaptedResumeId: "res_123",
              createdAt: "2026-05-01T00:00:00.000Z",
              scoreBefore: 50,
              scoreAfter: 73,
              canDownloadBaseCv: false,
              resumeUsedTitle: "CV Master",
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(screen.getByRole("button", { name: /baixar pdf/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /baixar docx/i })).toBeTruthy();
  });

  it("transitions from redeem loading to download actions on success", async () => {
    let resolveRedeem: ((value: Response) => void) | null = null;
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/plans/me") {
        return Promise.resolve({
          ok: true,
          json: async () => ({ creditsRemaining: 1 }),
        } as Response);
      }
      if (url === "/api/cv-adaptation/adp_123/redeem-credit") {
        return new Promise<Response>((resolve) => {
          resolveRedeem = resolve;
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    }) as unknown as typeof fetch;

    vi.stubGlobal("fetch", fetchMock);

    render(<DetailClient application={buildApplication()} header={<div />} />);

    const unlockButton = screen.getByRole("button", { name: /liberar cv/i });
    fireEvent.click(unlockButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Liberando..." })).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cv-adaptation/adp_123/redeem-credit",
      {
        method: "POST",
        cache: "no-store",
      },
    );

    resolveRedeem?.({ ok: true, json: async () => ({}) } as Response);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /baixar pdf/i })).toBeTruthy();
      expect(screen.getByRole("button", { name: /baixar docx/i })).toBeTruthy();
    });
  });

  it("shows Excluir only when archived and bestCvState is not unlocked", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );

    const { rerender } = render(
      <DetailClient
        application={buildApplication({
          archivedAt: "2026-05-01T00:00:00.000Z",
          bestCvState: "locked",
        })}
        header={<div />}
      />,
    );

    expect(screen.getByRole("button", { name: "Excluir" })).toBeTruthy();

    rerender(
      <DetailClient
        application={buildApplication({
          archivedAt: "2026-05-01T00:00:00.000Z",
          bestCvState: "unlocked",
        })}
        header={<div />}
      />,
    );

    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();

    rerender(
      <DetailClient
        application={buildApplication({
          archivedAt: "2026-05-01T00:00:00.000Z",
          bestCvState: "ready",
        })}
        header={<div />}
      />,
    );

    expect(screen.queryByRole("button", { name: "Excluir" })).toBeNull();
  });

  it("deletes archived application and redirects to archived view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ creditsRemaining: 1 }),
      })) as unknown as typeof fetch,
    );
    vi.mocked(deleteJobApplication).mockResolvedValue(
      buildApplication({
        id: "app_123",
        archivedAt: "2026-05-01T00:00:00.000Z",
      }),
    );

    render(
      <DetailClient
        application={buildApplication({
          archivedAt: "2026-05-01T00:00:00.000Z",
          bestCvState: "locked",
        })}
        header={<div />}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Excluir" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar exclusao" }));

    await waitFor(() => {
      expect(deleteJobApplication).toHaveBeenCalledWith("app_123");
      expect(routerPushMock).toHaveBeenCalledWith(
        "/candidaturas?view=arquivadas",
      );
      expect(routerRefreshMock).toHaveBeenCalled();
    });
  });
});
