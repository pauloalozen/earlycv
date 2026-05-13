import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AppSessionUser } from "@/lib/app-session";

const mocks = vi.hoisted(() => ({
  getCurrentAppUserFromCookies: vi.fn<() => Promise<AppSessionUser | null>>(),
  notFound: vi.fn<() => never>(),
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
}));

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: mocks.getCurrentAppUserFromCookies,
}));

import AdminLayout from "./layout";

function buildUser(overrides: Partial<AppSessionUser> = {}): AppSessionUser {
  return {
    id: "user-1",
    email: "user@earlycv.dev",
    name: "User",
    internalRole: "none",
    isStaff: false,
    emailVerifiedAt: new Date("2026-04-02T00:00:00.000Z").toISOString(),
    ...overrides,
  };
}

describe("AdminLayout access protection", () => {
  beforeEach(() => {
    mocks.getCurrentAppUserFromCookies.mockReset();
    mocks.notFound.mockReset();
  });

  it("calls notFound for anonymous users", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(null);
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(AdminLayout({ children: <div /> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("calls notFound for non-staff users", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(buildUser());
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    await expect(AdminLayout({ children: <div /> })).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("allows staff admin users", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(
      buildUser({
        internalRole: "admin",
        isStaff: true,
      }),
    );
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    const result = await AdminLayout({ children: <div /> });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("allows staff superadmin users", async () => {
    mocks.getCurrentAppUserFromCookies.mockResolvedValue(
      buildUser({
        internalRole: "superadmin",
        isStaff: true,
      }),
    );
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });

    const result = await AdminLayout({ children: <div /> });

    expect(result).toBeDefined();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });
});
