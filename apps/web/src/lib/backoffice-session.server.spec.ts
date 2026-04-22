import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  return {
    fetchCurrentAppUser: vi.fn(),
    get: vi.fn(),
    getAppSessionTokens: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mocks.get,
  })),
}));

vi.mock("./app-session.server", () => ({
  fetchCurrentAppUser: mocks.fetchCurrentAppUser,
  getAppSessionTokens: mocks.getAppSessionTokens,
}));

import { getBackofficeSessionToken } from "./backoffice-session.server";

describe("getBackofficeSessionToken", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.getAppSessionTokens.mockReset();
    mocks.fetchCurrentAppUser.mockReset();
  });

  it("returns app access token for staff users", async () => {
    mocks.getAppSessionTokens.mockResolvedValue({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    mocks.fetchCurrentAppUser.mockResolvedValue({
      internalRole: "superadmin",
      isStaff: true,
    });
    mocks.get.mockReturnValue(undefined);

    const token = await getBackofficeSessionToken();

    expect(token).toBe("access-1");
  });

  it("falls back to backoffice cookie when app session is unavailable", async () => {
    mocks.getAppSessionTokens.mockResolvedValue({
      accessToken: null,
      refreshToken: null,
    });
    mocks.fetchCurrentAppUser.mockResolvedValue(null);
    mocks.get.mockReturnValue({ value: "backoffice-1" });

    const token = await getBackofficeSessionToken();

    expect(token).toBe("backoffice-1");
  });
});
