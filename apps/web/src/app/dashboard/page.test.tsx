import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
);

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardPage from "./page";

describe("/dashboard redirect", () => {
  it("redirects to /meu-perfil", () => {
    expect(() => DashboardPage()).toThrowError("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/meu-perfil");
  });
});
