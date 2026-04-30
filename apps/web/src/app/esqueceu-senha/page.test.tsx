import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import EsqueceuSenhaPage from "./page";

vi.mock("@/components/page-shell", () => ({
  PageShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));

describe("EsqueceuSenhaPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renderiza header com identidade visual compartilhada", () => {
    render(<EsqueceuSenhaPage />);

    expect(screen.getByTestId("logo")).toBeTruthy();
    expect(screen.getByText("v1.2")).toBeTruthy();
  });

  it("mostra estado de sucesso apos submit ok", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(<EsqueceuSenhaPage />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "user@earlycv.dev" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Enviar link de redefinição" }));

    await waitFor(() => {
      expect(screen.getByText("Email enviado")).toBeTruthy();
    });
  });
});
