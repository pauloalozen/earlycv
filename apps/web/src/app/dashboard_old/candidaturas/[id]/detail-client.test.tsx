import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { JobApplicationDetailDto } from "@/lib/job-applications-api";
import { DetailClient } from "./detail-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

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
    expect(href).toContain("next=%2Fdashboard%2Fcandidaturas%2Fapp_123");
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
    unlockButton.click();

    expect(screen.getByRole("button", { name: "Liberando..." })).toBeTruthy();
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
});
