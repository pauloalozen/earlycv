import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    delete: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    delete: mocks.delete,
    get: mocks.get,
    set: mocks.set,
  })),
}));

import { persistAppSession } from "./app-session.server";

describe("persistAppSession", () => {
  beforeEach(() => {
    mocks.delete.mockReset();
    mocks.get.mockReset();
    mocks.set.mockReset();
    delete process.env.JWT_REFRESH_TTL;
  });

  it("persists auth cookies with maxAge aligned to refresh ttl", async () => {
    await persistAppSession({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      user: {
        email: "user@earlycv.dev",
        emailVerifiedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
        id: "user-1",
        internalRole: "none",
        isStaff: false,
        name: "User",
      },
    });

    expect(mocks.set).toHaveBeenCalled();
    const accessCall = mocks.set.mock.calls.find(
      (call) => call[0] === "earlycv-access-token",
    );
    const refreshCall = mocks.set.mock.calls.find(
      (call) => call[0] === "earlycv-refresh-token",
    );

    expect(accessCall?.[2]).toMatchObject({
      httpOnly: true,
      maxAge: 2_592_000,
      path: "/",
      sameSite: "lax",
    });
    expect(refreshCall?.[2]).toMatchObject({
      httpOnly: true,
      maxAge: 2_592_000,
      path: "/",
      sameSite: "lax",
    });
  });
});
