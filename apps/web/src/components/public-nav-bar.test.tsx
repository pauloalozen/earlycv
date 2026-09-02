import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { PublicNavBar } from "./public-nav-bar";

afterEach(() => {
  cleanup();
});

describe("PublicNavBar", () => {
  it("shows hamburger button on mobile layout", () => {
    render(<PublicNavBar />);

    expect(
      screen.getAllByLabelText("Abrir menu", { selector: "button" }).length,
    ).toBe(1);
  });

  it("opens and closes mobile menu", () => {
    render(<PublicNavBar />);

    const button = screen.getAllByLabelText("Abrir menu", {
      selector: "button",
    })[0];
    fireEvent.click(button);

    expect(screen.getAllByRole("link", { name: "Como funciona" }).length).toBe(
      2,
    );
    expect(
      screen.getAllByRole("link", { name: "Adaptar meu CV →" }).length,
    ).toBe(2);

    const blogLinks = screen.getAllByRole("link", { name: "Blog" });
    fireEvent.click(blogLinks[1]);
    expect(
      screen.getAllByLabelText("Abrir menu", { selector: "button" }).length,
    ).toBe(1);
  });

  it("hides 'Como funciona' links when configured", () => {
    render(<PublicNavBar hideHowItWorksLink />);

    const button = screen.getAllByLabelText("Abrir menu", {
      selector: "button",
    })[0];
    fireEvent.click(button);

    expect(screen.queryByRole("link", { name: "Como funciona" })).toBeNull();
  });

  it("uses fixed header when configured", () => {
    const { container } = render(<PublicNavBar fixed />);
    const nav = container.querySelector("nav");

    expect(nav?.getAttribute("style")).toContain("position: fixed");
    expect(nav?.getAttribute("style")).toContain("top: 0px");
    expect(nav?.getAttribute("style")).toContain("left: 0px");
    expect(nav?.getAttribute("style")).toContain("right: 0px");
    expect(nav?.getAttribute("style")).toContain(
      "background: rgb(243, 242, 237)",
    );
    expect(nav?.getAttribute("style")).not.toContain(
      "border-bottom: 1px solid",
    );
  });
});

describe("PublicNavBar — Alerta de Vaga Certa link under JOBS_GHOST_MODE", () => {
  // IS_JOBS_GHOST_MODE é uma constante de módulo (calculada uma vez no
  // import) — cada cenário precisa de um módulo fresco via
  // resetModules()/import() dinâmico pra refletir o env var do cenário.
  const originalWeb = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  afterEach(() => {
    cleanup();
    if (originalWeb === undefined) {
      delete process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;
    } else {
      process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = originalWeb;
    }
    vi.resetModules();
  });

  it("hides the Alerta link from a regular user while ghost mode is on", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    vi.resetModules();
    const { PublicNavBar: FreshPublicNavBar } = await import(
      "./public-nav-bar"
    );

    render(<FreshPublicNavBar userName="Paulo" userRole="none" />);

    expect(
      screen.queryByRole("link", { name: /Alerta de Vaga Certa/ }),
    ).toBeNull();
  });

  it("keeps the Alerta link visible for admin/superadmin while ghost mode is on", async () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";
    vi.resetModules();
    const { PublicNavBar: FreshPublicNavBar } = await import(
      "./public-nav-bar"
    );

    render(<FreshPublicNavBar userName="Paulo" userRole="admin" />);

    expect(
      screen.getAllByRole("link", { name: /Alerta de Vaga Certa/ }).length,
    ).toBeGreaterThan(0);
  });
});
