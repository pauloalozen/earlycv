import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "./app-header";

vi.mock("@/components/app-header-user-menu", () => ({
  AppHeaderUserMenu: () => null,
  buildUserMenuItems: () => [],
  LEARN_MENU_ITEMS: [],
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AppHeader bell", () => {
  it("lists the scheduled mock interview next to application interviews, linking to the order", async () => {
    const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60_000).toISOString();
    const inFiveDays = new Date(
      Date.now() + 5 * 24 * 60 * 60_000,
    ).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        json: async () =>
          url.includes("mock-interviews")
            ? { items: [{ id: "purchase-1", scheduledAt: inTwoDays }] }
            : {
                items: [
                  {
                    id: "app-1",
                    jobTitle: "Analista de Dados",
                    companyName: "Nubank",
                    nextActionAt: inFiveDays,
                    interviewTitle: null,
                  },
                ],
              },
      })),
    );

    render(<AppHeader userName="Maria" />);

    await waitFor(() =>
      expect(screen.getAllByText("2").length).toBeGreaterThan(0),
    );
    const mockLinks = screen
      .getAllByText("Entrevista simulada com o Paulo")
      .map((el) => el.closest("a")?.getAttribute("href"));
    expect(mockLinks).toContain("/simulacao-de-entrevista/pedido/purchase-1");
    const appLinks = screen
      .getAllByText("Analista de Dados")
      .map((el) => el.closest("a")?.getAttribute("href"));
    expect(appLinks).toContain("/candidaturas/app-1");
  });

  it("a failing mock interview endpoint does not hide application interviews", async () => {
    const inFiveDays = new Date(
      Date.now() + 5 * 24 * 60 * 60_000,
    ).toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("mock-interviews")) throw new Error("offline");
        return {
          json: async () => ({
            items: [
              {
                id: "app-1",
                jobTitle: "Analista de Dados",
                companyName: "Nubank",
                nextActionAt: inFiveDays,
                interviewTitle: null,
              },
            ],
          }),
        };
      }),
    );

    render(<AppHeader userName="Maria" />);

    await waitFor(() =>
      expect(screen.getAllByText("Analista de Dados").length).toBeGreaterThan(
        0,
      ),
    );
    expect(screen.queryByText("Entrevista simulada com o Paulo")).toBeNull();
  });
});
