import { describe, expect, it, vi } from "vitest";

const loginWithPasswordMock = vi.hoisted(() => vi.fn());
const persistAppSessionMock = vi.hoisted(() => vi.fn());
const createPostRedirectResponseMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth-api", () => ({
  loginWithPassword: loginWithPasswordMock,
  parseAuthApiError: () => ({ message: "erro" }),
}));

vi.mock("@/lib/app-session.server", () => ({
  persistAppSession: persistAppSessionMock,
}));

vi.mock("@/lib/route-response", () => ({
  createPostRedirectResponse: createPostRedirectResponseMock,
}));

import { POST } from "./route";

describe("POST /auth/login-user", () => {
  it("keeps payment recovery bridge redirect when next is URL-encoded", async () => {
    loginWithPasswordMock.mockResolvedValueOnce({
      accessToken: "a",
      refreshToken: "r",
      user: {
        id: "u1",
        name: "User",
        email: "u@x.com",
        emailVerifiedAt: "2026-01-01T00:00:00.000Z",
        isStaff: false,
        internalRole: "none",
      },
    });
    createPostRedirectResponseMock.mockReturnValueOnce(
      new Response(null, { status: 303 }),
    );

    const form = new FormData();
    form.set("email", "u@x.com");
    form.set("password", "123");
    form.set("next", "%2Fapi%2Fpayment-recovery%2Fbridge%2Fabc");

    await POST(
      new Request("http://localhost/auth/login-user", {
        method: "POST",
        body: form,
      }),
    );

    expect(createPostRedirectResponseMock).toHaveBeenCalledWith(
      "http://localhost/auth/login-user",
      "/api/payment-recovery/bridge/abc",
    );
    expect(persistAppSessionMock).toHaveBeenCalled();
  });
});
