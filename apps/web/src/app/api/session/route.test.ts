import { describe, expect, it, vi } from "vitest";

const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

import { GET, dynamic } from "./route";

describe("/api/session route", () => {
  it("returns anonymous payload for unauthenticated users", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce(null);

    const response = await GET();
    const payload = await response.json();

    expect(dynamic).toBe("force-dynamic");
    expect(payload).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("returns minimal authenticated payload", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValueOnce({
      email: "user@example.com",
      id: "user-42",
      name: "User 42",
    });

    const response = await GET();
    const payload = await response.json();

    expect(payload).toEqual({
      authenticated: true,
      user: {
        email: "user@example.com",
        id: "user-42",
        name: "User 42",
      },
    });
    expect(Object.keys(payload.user)).toEqual(["email", "id", "name"]);
  });
});
