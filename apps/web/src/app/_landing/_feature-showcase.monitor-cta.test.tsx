import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MonitorMock } from "./_feature-showcase";

describe("MonitorMock CTA under JOBS_GHOST_MODE", () => {
  const originalGhostMode = process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

  afterEach(() => {
    cleanup();
    if (originalGhostMode === undefined) {
      delete process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;
    } else {
      process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = originalGhostMode;
    }
  });

  it("shows the CTA when ghost mode is off", () => {
    delete process.env.NEXT_PUBLIC_JOBS_GHOST_MODE;

    render(<MonitorMock />);

    expect(
      screen.getByRole("link", { name: /Ativar meu Alerta de Vaga Certa/i }),
    ).toBeInTheDocument();
  });

  it("hides the CTA while ghost mode is on — anonymous visitor would just hit a 404", () => {
    process.env.NEXT_PUBLIC_JOBS_GHOST_MODE = "true";

    render(<MonitorMock />);

    expect(
      screen.queryByRole("link", { name: /Ativar meu Alerta de Vaga Certa/i }),
    ).not.toBeInTheDocument();
  });
});
