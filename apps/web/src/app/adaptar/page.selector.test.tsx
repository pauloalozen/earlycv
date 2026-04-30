import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getAuthStatusMock = vi.hoisted(() => vi.fn());
const getMyMasterResumeMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/components/app-header", () => ({
  AppHeader: () => <div data-testid="app-header" />,
}));

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/session-actions", () => ({
  getAuthStatus: getAuthStatusMock,
}));

vi.mock("@/lib/resumes-api", () => ({
  getMyMasterResume: getMyMasterResumeMock,
}));

vi.mock("@/lib/cv-adaptation-api", () => ({
  analyzeAuthenticatedCv: vi.fn(),
  analyzeGuestCv: vi.fn(),
  emitBusinessFunnelEvent: vi.fn().mockResolvedValue(undefined),
  saveGuestPreview: vi.fn(),
}));

import AdaptarPage from "./page";

describe("AdaptarPage selector defaults", () => {
  beforeEach(() => {
    getAuthStatusMock.mockReset();
    getMyMasterResumeMock.mockReset();
    getMyMasterResumeMock.mockResolvedValue(null);
  });

  afterEach(() => {
    cleanup();
  });

  it("shows upload/text selector for authenticated user without master CV", async () => {
    getAuthStatusMock.mockResolvedValue({ userName: "Ana" });

    render(<AdaptarPage />);

    expect(await screen.findByRole("button", { name: "Upload" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Digitar texto" })).toBeTruthy();
  });

  it("defaults guest selector to upload mode", async () => {
    getAuthStatusMock.mockResolvedValue({ userName: null });

    render(<AdaptarPage />);

    const uploadButton = await screen.findByRole("button", { name: "Upload" });
    expect(uploadButton).toBeTruthy();
    expect(uploadButton.getAttribute("style") ?? "").toContain(
      "background: rgb(10, 10, 10)",
    );
  });
});
