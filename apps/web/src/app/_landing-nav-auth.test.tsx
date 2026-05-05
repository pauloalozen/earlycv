import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { LandingNavAuth } from "./_landing-nav-auth";

describe("LandingNavAuth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps auth CTAs hidden while session is loading", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise<Response>(() => {}),
    );

    render(<LandingNavAuth />);

    expect(screen.getByRole("link", { name: "Blog" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Entrar →" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "Ir para o painel →" }),
    ).toBeNull();
    expect(
      screen.getByTestId("landing-auth-placeholder").getAttribute("style"),
    ).toContain("width: 176px");
  });

  it("shows authenticated CTA after session resolves", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: true }),
    } as Response);

    render(<LandingNavAuth />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Ir para o painel →" }),
      ).toBeTruthy();
    });

    expect(screen.queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Entrar →" })).toBeNull();
    expect(screen.getByRole("link", { name: "Blog" })).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Ir para o painel →" })
        .getAttribute("style"),
    ).toContain("width: 176px");
  });

  it("shows blog link and entrar when unauthenticated", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false }),
    } as Response);

    render(<LandingNavAuth />);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Entrar" })).toBeTruthy();
    });

    expect(screen.getByRole("link", { name: "Blog" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Entrar" }).getAttribute("style"),
    ).toContain("width: 176px");
  });
});
