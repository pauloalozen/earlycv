import { beforeEach, describe, expect, it, vi } from "vitest";

const loginWithPasswordMock = vi.hoisted(() => vi.fn());
const persistAppSessionMock = vi.hoisted(() => vi.fn());
const createPostRedirectResponseMock = vi.hoisted(() => vi.fn());
const claimGuestAnalysisJobServerSideMock = vi.hoisted(() => vi.fn());

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

vi.mock("@/lib/guest-analysis-claim.server", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/guest-analysis-claim.server")
  >("@/lib/guest-analysis-claim.server");
  return {
    ...actual,
    claimGuestAnalysisJobServerSide: claimGuestAnalysisJobServerSideMock,
  };
});

import { POST } from "./route";

const AUTHENTICATED_SESSION = {
  accessToken: "a",
  refreshToken: "r",
  user: {
    id: "u1",
    name: "User",
    email: "u@x.com",
    emailVerifiedAt: "2026-01-01T00:00:00.000Z",
    isStaff: false,
    internalRole: "none" as const,
  },
};

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

  describe("cenário A vs cenário B do gate de /adaptar", () => {
    beforeEach(() => {
      loginWithPasswordMock.mockReset();
      createPostRedirectResponseMock.mockReset();
      claimGuestAnalysisJobServerSideMock.mockReset();
      loginWithPasswordMock.mockResolvedValue(AUTHENTICATED_SESSION);
      createPostRedirectResponseMock.mockImplementation(
        (_url: string, destination: string) =>
          new Response(null, {
            status: 303,
            headers: { Location: destination },
          }),
      );
    });

    it("cenário A — sem análise guest pendente: next=/adaptar volta pro /adaptar, sem tentar claim", async () => {
      const form = new FormData();
      form.set("email", "u@x.com");
      form.set("password", "123");
      form.set("next", "/adaptar");

      await POST(
        new Request("http://localhost/auth/login-user", {
          method: "POST",
          body: form,
        }),
      );

      expect(claimGuestAnalysisJobServerSideMock).not.toHaveBeenCalled();
      expect(createPostRedirectResponseMock).toHaveBeenCalledWith(
        "http://localhost/auth/login-user",
        "/adaptar",
      );
    });

    it("cenário B — análise guest pendente: claim vence sobre next (que nem chega a ser setado pela landing)", async () => {
      claimGuestAnalysisJobServerSideMock.mockResolvedValue({
        status: "succeeded",
        cvAdaptationId: "adaptation-1",
      });

      const form = new FormData();
      form.set("email", "u@x.com");
      form.set("password", "123");
      form.set("guestAnalysisJobId", "job-1");
      form.set("guestPossessionToken", "token-1");

      await POST(
        new Request("http://localhost/auth/login-user", {
          method: "POST",
          body: form,
        }),
      );

      expect(claimGuestAnalysisJobServerSideMock).toHaveBeenCalledWith(
        "a",
        "job-1",
        "token-1",
      );
      expect(createPostRedirectResponseMock).toHaveBeenCalledWith(
        "http://localhost/auth/login-user",
        "/adaptar/resultado?adaptationId=adaptation-1",
      );
    });
  });
});
