import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VagasTabClient } from "./vagas-tab-client";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function job(overrides: Record<string, unknown>) {
  return {
    canonicalKey: "inhire:acme:1",
    company: { name: "Acme" },
    companyId: "c1",
    descriptionClean: "desc",
    enrichment: { dominantArea: "DATA_AI", enrichmentStatus: "COMPLETED" },
    id: "job-1",
    jobSourceId: "s1",
    locationText: "São Paulo",
    slug: "vaga-acme-1",
    status: "active",
    title: "Vaga Visível",
    ...overrides,
  };
}

async function renderWith(jobs: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobs, page: 1, pageSize: 20, total: jobs.length }),
    }),
  );
  render(<VagasTabClient availableSourceNames={[]} />);
  return Promise.all(
    jobs.map((j) =>
      screen
        .findByText((j as { title: string }).title)
        .then((cell) => cell.closest("tr")),
    ),
  );
}

describe("VagasTabClient — botão Ver vaga", () => {
  it("abre a página pública da vaga visível e da vaga encerrada em nova aba", async () => {
    const [visible, closed] = await renderWith([
      job({}),
      job({
        id: "job-2",
        slug: "vaga-acme-2",
        status: "inactive",
        title: "Vaga Encerrada",
      }),
    ]);

    for (const [row, slug] of [
      [visible, "vaga-acme-1"],
      [closed, "vaga-acme-2"],
    ] as const) {
      const link = within(row as HTMLElement).getByRole("link", {
        name: "Ver vaga ↗",
      });
      expect(link).toHaveAttribute("href", `/radar/${slug}`);
      expect(link).toHaveAttribute("target", "_blank");
    }
  });

  it("fica desabilitado, com o motivo, quando a vaga não tem página pública", async () => {
    const [row] = await renderWith([
      job({
        enrichment: { dominantArea: "OTHER", enrichmentStatus: "COMPLETED" },
        title: "Vaga Oculta",
      }),
    ]);

    const button = within(row as HTMLElement).getByRole("button", {
      name: "Ver vaga ↗",
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Sem página pública: área OTHER");
  });
});
