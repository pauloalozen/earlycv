import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn<(path: string) => never>(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getMonitorAccess: vi.fn(),
  listMonitorRecommendations: vi.fn(),
  getMonitorLevelCounts: vi.fn(),
  getMonitorCount: vi.fn(),
  getMonitorProfile: vi.fn(),
  getMonitorAlertPreferences: vi.fn(),
  getMyPlan: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));
vi.mock("@/lib/monitor-api", () => ({
  getMonitorAccess: mocks.getMonitorAccess,
  listMonitorRecommendations: mocks.listMonitorRecommendations,
  getMonitorLevelCounts: mocks.getMonitorLevelCounts,
  getMonitorCount: mocks.getMonitorCount,
  getMonitorProfile: mocks.getMonitorProfile,
  getMonitorAlertPreferences: mocks.getMonitorAlertPreferences,
}));
vi.mock("@/lib/plans-api", () => ({
  getMyPlan: mocks.getMyPlan,
}));
vi.mock("@/components/public-nav-bar", () => ({
  PublicNavBar: () => <div>nav</div>,
}));
vi.mock("@/components/public-footer", () => ({
  PublicFooter: () => <div>footer</div>,
}));
vi.mock("./monitor-view", () => ({
  MonitorView: () => <div>monitor-view</div>,
}));

import MonitorPage from "./page";

function buildUser(overrides: Partial<AppSessionUser> = {}): AppSessionUser {
  return {
    id: "user-1",
    email: "user@earlycv.dev",
    name: "User",
    internalRole: "none",
    isStaff: false,
    emailVerifiedAt: new Date("2026-05-23T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

const EMPTY_COUNTS = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

describe("/monitor access — authenticated-only, no guest fallback", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getMonitorAccess.mockReset();
    mocks.listMonitorRecommendations.mockReset();
    mocks.getMonitorLevelCounts.mockReset();
    mocks.getMonitorCount.mockReset();
    mocks.getMonitorProfile.mockReset();
    mocks.getMonitorAlertPreferences.mockReset();
    mocks.getMyPlan.mockReset();

    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`REDIRECT:${path}`);
    });
    mocks.getMonitorAccess.mockResolvedValue({
      allowed: true,
      reason: "launch_access",
    });
    mocks.listMonitorRecommendations.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 4,
      monitorStatus: "ACTIVE",
    });
    mocks.getMonitorLevelCounts.mockResolvedValue(EMPTY_COUNTS);
    mocks.getMonitorCount.mockResolvedValue({
      count: 0,
      monitorStatus: "ACTIVE",
    });
    mocks.getMonitorProfile.mockResolvedValue(null);
    mocks.getMonitorAlertPreferences.mockResolvedValue(null);
    mocks.getMyPlan.mockResolvedValue(null);
  });

  it("redirects an unauthenticated user to /entrar instead of rendering the page", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);

    await expect(MonitorPage()).rejects.toThrow("REDIRECT:/entrar");
  });

  it("allows a regular authenticated user", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());

    const result = await MonitorPage();

    expect(result).toBeDefined();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("only fetches a level's first page when that level actually has recommendations", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMonitorLevelCounts.mockResolvedValue({
      ...EMPTY_COUNTS,
      5: 3,
      3: 1,
    });

    await MonitorPage();

    expect(mocks.listMonitorRecommendations).toHaveBeenCalledTimes(2);
    expect(mocks.listMonitorRecommendations).toHaveBeenCalledWith(
      1,
      4,
      false,
      5,
    );
    expect(mocks.listMonitorRecommendations).toHaveBeenCalledWith(
      1,
      4,
      false,
      3,
    );
  });

  it("fetches no per-level page when every level is empty", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());

    await MonitorPage();

    expect(mocks.listMonitorRecommendations).not.toHaveBeenCalled();
  });

  it("redirects an authenticated user without Monitor entitlement, without ever fetching level data", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMonitorAccess.mockResolvedValue({
      allowed: false,
      reason: "none",
    });

    await expect(MonitorPage()).rejects.toThrow(/^REDIRECT:/);

    expect(mocks.getMonitorLevelCounts).not.toHaveBeenCalled();
    expect(mocks.listMonitorRecommendations).not.toHaveBeenCalled();
  });
});
