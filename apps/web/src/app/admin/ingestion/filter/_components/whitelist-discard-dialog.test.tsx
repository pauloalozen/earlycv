import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { FilterActionUiResult } from "../actions";
import { WhitelistDiscardDialog } from "./whitelist-discard-dialog";

afterEach(() => {
  cleanup();
});

describe("WhitelistDiscardDialog", () => {
  it("opens the dialog, submits the term and shows the success message", async () => {
    const whitelistAction = vi.fn().mockResolvedValue({
      kind: "success",
      message: "Termo adicionado. Nova versao v2 criada.",
    } satisfies FilterActionUiResult);

    render(
      <WhitelistDiscardDialog
        discardId="discard-1"
        suggestedTerm="governanca de ti"
        title="Analista de Governanca de TI Sr"
        whitelistAction={whitelistAction}
      />,
    );

    expect(
      screen.queryByText("Adicionar ao filtro semantico"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Whitelist" }));

    expect(
      screen.getByText("Adicionar ao filtro semantico"),
    ).toBeInTheDocument();
    const input = screen.getByLabelText<HTMLInputElement>(
      "Termo a adicionar em techSignals",
    );
    expect(input.value).toBe("governanca de ti");

    fireEvent.click(
      screen.getByRole("button", {
        name: "Adicionar e criar nova versao do filtro",
      }),
    );

    expect(
      await screen.findByText(/Termo adicionado\. Nova versao v2 criada\./),
    ).toBeInTheDocument();
    expect(whitelistAction).toHaveBeenCalled();
  });

  it("closes the dialog on cancel without calling the action", () => {
    const whitelistAction = vi.fn();

    render(
      <WhitelistDiscardDialog
        discardId="discard-1"
        suggestedTerm="governanca de ti"
        title="Analista de Governanca de TI Sr"
        whitelistAction={whitelistAction}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Whitelist" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(
      screen.queryByText("Adicionar ao filtro semantico"),
    ).not.toBeInTheDocument();
    expect(whitelistAction).not.toHaveBeenCalled();
  });
});
