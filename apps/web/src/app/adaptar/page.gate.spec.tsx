import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());
const fetchGuestAnalysisAuthGateEnabledServerMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/lib/guest-analysis-auth-gate.server", () => ({
  fetchGuestAnalysisAuthGateEnabledServer:
    fetchGuestAnalysisAuthGateEnabledServerMock,
}));

vi.mock("./adaptar-client", () => ({
  AdaptarPageClient: () => null,
}));

import AdaptarPage from "./page";

const AUTHENTICATED_USER = {
  email: "ana@example.com",
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
  id: "user-1",
  internalRole: "none" as const,
  isStaff: false,
  name: "Ana",
};

describe("AdaptarPage server gate", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    getCurrentAppUserFromCookiesMock.mockReset();
    fetchGuestAnalysisAuthGateEnabledServerMock.mockReset();
  });

  it("flag ON + sem sessão: redireciona para /entrar?next=/adaptar", async () => {
    fetchGuestAnalysisAuthGateEnabledServerMock.mockResolvedValue(true);
    getCurrentAppUserFromCookiesMock.mockResolvedValue(null);

    await AdaptarPage();

    expect(redirectMock).toHaveBeenCalledWith("/entrar?next=/adaptar");
  });

  it("flag ON + autenticado: não redireciona", async () => {
    fetchGuestAnalysisAuthGateEnabledServerMock.mockResolvedValue(true);
    getCurrentAppUserFromCookiesMock.mockResolvedValue(AUTHENTICATED_USER);

    await AdaptarPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("flag OFF + sem sessão: não redireciona (rollback preserva guest)", async () => {
    fetchGuestAnalysisAuthGateEnabledServerMock.mockResolvedValue(false);
    getCurrentAppUserFromCookiesMock.mockResolvedValue(null);

    await AdaptarPage();

    expect(redirectMock).not.toHaveBeenCalled();
    expect(getCurrentAppUserFromCookiesMock).not.toHaveBeenCalled();
  });

  it("flag OFF + autenticado: não redireciona", async () => {
    fetchGuestAnalysisAuthGateEnabledServerMock.mockResolvedValue(false);
    getCurrentAppUserFromCookiesMock.mockResolvedValue(AUTHENTICATED_USER);

    await AdaptarPage();

    expect(redirectMock).not.toHaveBeenCalled();
  });
});
