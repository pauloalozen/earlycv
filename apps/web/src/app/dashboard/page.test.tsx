import { describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardPage from "./page";

describe("/dashboard", () => {
  it("redirects legacy dashboard route to meu-perfil", () => {
    DashboardPage();
    expect(redirectMock).toHaveBeenCalledWith("/meu-perfil");
  });
});
