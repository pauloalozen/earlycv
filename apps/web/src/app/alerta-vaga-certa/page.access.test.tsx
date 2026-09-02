import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn<(path: string) => never>(),
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  getMonitorAccess: vi.fn(),
  listMonitorNotifications: vi.fn(),
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
  listMonitorNotifications: mocks.listMonitorNotifications,
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

const EMPTY_FEED = {
  pending: null,
  groups: [],
  page: 1,
  limit: 10,
  totalGroups: 0,
  hasMore: false,
  nextPage: null,
  monitorStatus: "ACTIVE",
};

describe("/alerta-vaga-certa access — authenticated-only, no guest fallback", () => {
  beforeEach(() => {
    mocks.redirect.mockReset();
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.getMonitorAccess.mockReset();
    mocks.listMonitorNotifications.mockReset();
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
    mocks.listMonitorNotifications.mockResolvedValue(EMPTY_FEED);
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

  it("fetches the notifications feed with the default page/limit", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());

    await MonitorPage();

    expect(mocks.listMonitorNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.listMonitorNotifications).toHaveBeenCalledWith(1, 10);
  });

  it("redirects an authenticated user without entitlement, without ever fetching notifications", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.getMonitorAccess.mockResolvedValue({
      allowed: false,
      reason: "none",
    });

    await expect(MonitorPage()).rejects.toThrow(/^REDIRECT:/);

    expect(mocks.listMonitorNotifications).not.toHaveBeenCalled();
  });
});
