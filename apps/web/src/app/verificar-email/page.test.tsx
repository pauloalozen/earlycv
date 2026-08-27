import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const getCurrentAppUserFromCookiesMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/app-session.server", () => ({
  getCurrentAppUserFromCookies: getCurrentAppUserFromCookiesMock,
}));

vi.mock("@/components/auth/auth-mono-shell", () => ({
  AuthMonoShell: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("./verify-form", () => ({
  VerifyForm: () => null,
}));

import VerifyEmailPage from "./page";

const UNVERIFIED_USER = {
  email: "ana@example.com",
  emailVerifiedAt: null,
  id: "user-1",
  internalRole: "none" as const,
  isStaff: false,
  name: "Ana",
};

const VERIFIED_USER = {
  ...UNVERIFIED_USER,
  emailVerifiedAt: "2026-01-01T00:00:00.000Z",
};

function searchParams(params: { next?: string } = {}) {
  return Promise.resolve(params);
}

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    getCurrentAppUserFromCookiesMock.mockReset();
  });

  it("sem sessão: redireciona para /entrar", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValue(null);

    await VerifyEmailPage({ searchParams: searchParams() });

    expect(redirectMock).toHaveBeenCalledWith("/entrar");
  });

  it("não verificado: não redireciona, mostra o formulário", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValue(UNVERIFIED_USER);

    await VerifyEmailPage({ searchParams: searchParams() });

    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("já verificado + next do claim guest: preserva o next em vez de ir pro /meu-perfil", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValue(VERIFIED_USER);

    await VerifyEmailPage({
      searchParams: searchParams({
        next: "/adaptar/resultado?adaptationId=abc-123",
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      "/adaptar/resultado?adaptationId=abc-123",
    );
  });

  it("já verificado + sem next: cai no destino padrão (/meu-perfil)", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValue(VERIFIED_USER);

    await VerifyEmailPage({ searchParams: searchParams() });

    expect(redirectMock).toHaveBeenCalledWith("/meu-perfil");
  });

  it("já verificado + next inseguro: ignora o next e cai no padrão", async () => {
    getCurrentAppUserFromCookiesMock.mockResolvedValue(VERIFIED_USER);

    await VerifyEmailPage({
      searchParams: searchParams({ next: "//evil.com" }),
    });

    expect(redirectMock).toHaveBeenCalledWith("/meu-perfil");
  });
});
