import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    notes: null,
    appliedAt: null,
    nextActionAt: null,
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
      },
    ],
    ...overrides,
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
            },
          ],
        })}
        header={<div />}
      />,
    );

    expect(screen.getByText("Versão atual")).toBeTruthy();
    expect(screen.getByText("Melhor versão")).toBeTruthy();
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
